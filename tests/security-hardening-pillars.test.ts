import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PGlite } from '@electric-sql/pglite';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import {
  DEFAULT_DEV_AUTH_SECRET,
  getClientIp,
  hashPassword,
  isProductionAuthSecretConfigured,
  resolveConfiguredAuthSecret,
  revokeAllSessionsForUser,
  signSessionToken,
  verifySessionToken,
} from '@/lib/auth';
import { getClientIp as getRateLimitClientIp } from '@/lib/rate-limit';
import { middleware } from '@/middleware';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { PATCH as adminUsersPatch } from '@/app/api/admin/users/route';
import { GET as getLeadPdfRoute } from '@/app/api/leads/[id]/pdf/route';

describe('Security Hardening Pillars Suite', () => {
  let prisma: PrismaClient;
  let pglite: PGlite;
  let cleanupDb: () => Promise<void>;

  let adminUser: { id: string; email: string; token: string };
  let testDev: { id: string; email: string; token: string };
  let testLeadId: string;

  beforeAll(async () => {
    const testDb = await createInMemoryTestDb();
    prisma = testDb.prisma;
    pglite = testDb.pglite;
    cleanupDb = testDb.cleanup;
    setPrismaClientForTesting(prisma, pglite);

    const passwordHash = await hashPassword('CorrectPassword123!');

    const admin = await prisma.user.create({
      data: {
        name: 'Admin User',
        email: 'admin-hardening@test.com',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    const dev = await prisma.user.create({
      data: {
        name: 'Developer User',
        email: 'dev-hardening@test.com',
        passwordHash,
        role: 'DEVELOPER',
        status: 'ACTIVE',
      },
    });

    const lead = await prisma.lead.create({
      data: {
        businessName: 'عيادة الشفاء',
        normalizedName: 'عياده الشفاء',
        category: 'Medical',
        governorate: 'القاهرة',
        city: 'القاهرة',
        phone: '+201012345678',
        normalizedPhone: '+201012345678',
        status: 'AVAILABLE',
      },
    });
    testLeadId = lead.id;

    // Claim the lead for testDev so PDF route can be tested
    await prisma.leadClaim.create({
      data: {
        leadId: lead.id,
        userId: dev.id,
      },
    });

    adminUser = {
      id: admin.id,
      email: admin.email,
      token: await signSessionToken({
        userId: admin.id,
        email: admin.email,
        name: admin.name,
        role: 'ADMIN',
      }),
    };

    testDev = {
      id: dev.id,
      email: dev.email,
      token: await signSessionToken({
        userId: dev.id,
        email: dev.email,
        name: dev.name,
        role: 'DEVELOPER',
      }),
    };
  });

  afterAll(async () => {
    await cleanupDb();
  });

  // =========================================================================
  // Pillar 1: Secret & Database Session Revocation
  // =========================================================================
  describe('Pillar 1: Secret & Database Session Revocation', () => {
    it('enforces strong AUTH_SECRET in production and throws if weak or default', () => {
      const origEnv = process.env.NODE_ENV;
      const origAuth = process.env.AUTH_SECRET;
      const origJwt = process.env.JWT_SECRET;

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        process.env.AUTH_SECRET = DEFAULT_DEV_AUTH_SECRET;
        delete process.env.JWT_SECRET;

        expect(isProductionAuthSecretConfigured()).toBe(false);
        expect(() => resolveConfiguredAuthSecret()).toThrow(/Production AUTH_SECRET must be configured/);

        // Weak secret (<32 chars)
        process.env.AUTH_SECRET = 'short-secret';
        expect(isProductionAuthSecretConfigured()).toBe(false);
        expect(() => resolveConfiguredAuthSecret()).toThrow(/Production AUTH_SECRET must be configured/);

        // Strong 64-char secret
        process.env.AUTH_SECRET = '7c4b8e2d1f9a0b3c5e7d6a8f4c2e1b0a9d8c7e6f5a4b3c2d1e0f9a8b7c6d5e4f';
        expect(isProductionAuthSecretConfigured()).toBe(true);
        expect(resolveConfiguredAuthSecret()).toBe(
          '7c4b8e2d1f9a0b3c5e7d6a8f4c2e1b0a9d8c7e6f5a4b3c2d1e0f9a8b7c6d5e4f'
        );
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
        if (origAuth === undefined) {
          delete process.env.AUTH_SECRET;
        } else {
          process.env.AUTH_SECRET = origAuth;
        }
        if (origJwt === undefined) {
          delete process.env.JWT_SECRET;
        } else {
          process.env.JWT_SECRET = origJwt;
        }
      }
    });

    it('immediately invalidates any token issued prior to sessionsRevokedBefore in database', async () => {
      const user = await prisma.user.create({
        data: {
          name: 'Revocation Test User',
          email: 'revocation@test.com',
          passwordHash: 'hash',
          role: 'DEVELOPER',
          status: 'ACTIVE',
        },
      });

      const token1 = await signSessionToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: 'DEVELOPER',
      });

      expect(await verifySessionToken(token1)).not.toBeNull();

      // Revoke sessions in the database for this user
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionsRevokedBefore: new Date(Date.now() + 1000) },
      });

      // Token1 was issued before the revocation timestamp, so it must be invalid
      expect(await verifySessionToken(token1)).toBeNull();

      // Token issued AFTER revocation timestamp must be valid
      // Wait briefly to ensure issued after revocation timestamp
      await new Promise((r) => setTimeout(r, 1100));
      const token2 = await signSessionToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: 'DEVELOPER',
      });
      expect(await verifySessionToken(token2)).not.toBeNull();
    });
  });

  // =========================================================================
  // Pillar 2: Edge Route Guarding in src/middleware.ts
  // =========================================================================
  describe('Pillar 2: Edge Route Guarding in src/middleware.ts', () => {
    it('redirects unauthenticated requests to protected routes to /login?from=${pathname}', async () => {
      const protectedPaths = [
        '/dashboard',
        '/dashboard/overview',
        '/admin',
        '/admin/users',
        '/pipeline',
        '/credits',
        '/settings',
        '/my-leads',
      ];

      for (const path of protectedPaths) {
        const req = new NextRequest(`http://localhost:3000${path}`);
        const res = await middleware(req);
        expect(res.status).toBe(307);
        const location = res.headers.get('location');
        expect(location).toContain(`/login?from=${encodeURIComponent(path)}`);
      }
    });

    it('redirects non-admin users attempting to access /admin/:path* to /dashboard', async () => {
      const req = new NextRequest('http://localhost:3000/admin/users', {
        headers: {
          cookie: `leadforge_session=${testDev.token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
    });

    it('allows authenticated admin to access /admin and authenticated developer to access /dashboard', async () => {
      const adminReq = new NextRequest('http://localhost:3000/admin/users', {
        headers: {
          cookie: `leadforge_session=${adminUser.token}`,
        },
      });
      const adminRes = await middleware(adminReq);
      expect(adminRes.status).toBe(200);

      const devReq = new NextRequest('http://localhost:3000/dashboard', {
        headers: {
          cookie: `leadforge_session=${testDev.token}`,
        },
      });
      const devRes = await middleware(devReq);
      expect(devRes.status).toBe(200);
    });

    it('in production, strips/blocks ?fixtures=true on /dashboard', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

        const req = new NextRequest('http://localhost:3000/dashboard?fixtures=true', {
          headers: {
            cookie: `leadforge_session=${testDev.token}`,
          },
        });

        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe('http://localhost:3000/dashboard');
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
      }
    });

    it('in development, allows unauthenticated access to /dashboard?fixtures=true', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'development';

        const req = new NextRequest('http://localhost:3000/dashboard?fixtures=true');
        const res = await middleware(req);
        // Does not redirect to login, passes through
        expect(res.status).toBe(200);
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
      }
    });

    it('in production, rejects access and redirects to /login when AUTH_SECRET is weak or default dev secret', async () => {
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.AUTH_SECRET;
      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        process.env.AUTH_SECRET = 'leadforge-egypt-local-dev-secret-change-in-production-32chars';

        const req = new NextRequest('http://localhost:3000/dashboard', {
          headers: {
            cookie: `leadforge_session=${testDev.token}`,
          },
        });

        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/login?from=%2Fdashboard');
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
        process.env.AUTH_SECRET = origSecret;
      }
    });
  });

  // =========================================================================
  // Pillar 3: Account Lockout & Brute-Force Protection
  // =========================================================================
  describe('Pillar 3: Account Lockout & Brute-Force Protection', () => {
    it('prioritizes cf-connecting-ip and x-real-ip over x-forwarded-for to prevent spoofing', () => {
      const headers = new Headers({
        'cf-connecting-ip': '198.51.100.1',
        'x-real-ip': '198.51.100.2',
        'x-forwarded-for': '198.51.100.3, 10.0.0.1',
      });
      const req = new Request('http://localhost:3000', { headers });

      expect(getClientIp(req)).toBe('198.51.100.1');
      expect(getRateLimitClientIp(headers)).toBe('198.51.100.1');

      // Without Cloudflare header, should use x-real-ip
      headers.delete('cf-connecting-ip');
      const req2 = new Request('http://localhost:3000', { headers });
      expect(getClientIp(req2)).toBe('198.51.100.2');
      expect(getRateLimitClientIp(headers)).toBe('198.51.100.2');

      // Without x-real-ip, should fall back to x-forwarded-for
      headers.delete('x-real-ip');
      const req3 = new Request('http://localhost:3000', { headers });
      expect(getClientIp(req3)).toBe('198.51.100.3');
      expect(getRateLimitClientIp(headers)).toBe('198.51.100.3');
    });

    it('increments failedLoginAttempts on incorrect password and locks account after 5 failed attempts', async () => {
      const user = await prisma.user.create({
        data: {
          name: 'Brute Force Target',
          email: 'target@test.com',
          passwordHash: await hashPassword('SecretPass123!'),
          role: 'DEVELOPER',
          status: 'ACTIVE',
        },
      });

      // 5 wrong attempts return 401 and increment counter up to 5
      for (let i = 0; i < 5; i++) {
        const req = new NextRequest('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Host: 'localhost:3000',
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({ email: user.email, password: `WrongPass_${i}` }),
        });
        const res = await loginPost(req);
        expect(res.status).toBe(401);
      }

      // Check DB: failedLoginAttempts is 5
      const dbUserAfter5 = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUserAfter5?.failedLoginAttempts).toBe(5);

      // 6th incorrect attempt: account triggers lockout
      const lockReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ email: user.email, password: 'WrongPass_6' }),
      });
      const lockRes = await loginPost(lockReq);
      expect(lockRes?.status).toBe(423);

      const dbUserLocked = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUserLocked?.failedLoginAttempts).toBe(6);
      expect(dbUserLocked?.lockedUntil).not.toBeNull();
      expect(dbUserLocked!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

      // Subsequent attempt even with correct password is blocked while locked
      const blockedReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ email: user.email, password: 'SecretPass123!' }),
      });
      const blockedRes = await loginPost(blockedReq);
      expect(blockedRes.status).toBe(423);
      const blockedJson = await blockedRes.json();
      expect(blockedJson.code).toBe('ACCOUNT_LOCKED');

      // Once lockedUntil is cleared, successful login resets failedLoginAttempts
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: null },
      });

      const successReq = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ email: user.email, password: 'SecretPass123!' }),
      });
      const successRes = await loginPost(successReq);
      expect(successRes.status).toBe(200);

      const dbUserSuccess = await prisma.user.findUnique({ where: { id: user.id } });
      expect(dbUserSuccess?.failedLoginAttempts).toBe(0);
      expect(dbUserSuccess?.lockedUntil).toBeNull();
    });
  });

  // =========================================================================
  // Pillar 4: Full Lockdown for Suspended Users
  // =========================================================================
  describe('Pillar 4: Full Lockdown for Suspended Users', () => {
    it('sets sessionsRevokedBefore and invalidates all JWTs when admin suspends user', async () => {
      const devToSuspend = await prisma.user.create({
        data: {
          name: 'Dev to Suspend',
          email: 'suspend-me@test.com',
          passwordHash: 'hash',
          role: 'DEVELOPER',
          status: 'ACTIVE',
        },
      });

      const tokenBefore = await signSessionToken({
        userId: devToSuspend.id,
        email: devToSuspend.email,
        name: devToSuspend.name,
        role: 'DEVELOPER',
      });
      expect(await verifySessionToken(tokenBefore)).not.toBeNull();

      // Admin suspends user via PATCH /api/admin/users
      const patchReq = new NextRequest('http://localhost:3000/api/admin/users', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminUser.token}`,
          'Content-Type': 'application/json',
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          userId: devToSuspend.id,
          status: 'SUSPENDED',
        }),
      });

      const patchRes = await adminUsersPatch(patchReq);
      expect(patchRes.status).toBe(200);

      const updatedUser = await prisma.user.findUnique({ where: { id: devToSuspend.id } });
      expect(updatedUser?.status).toBe('SUSPENDED');
      expect(updatedUser?.sessionsRevokedBefore).not.toBeNull();

      // Active JWT token is now instantly invalidated
      expect(await verifySessionToken(tokenBefore)).toBeNull();
    });

    it('strictly returns 403 Forbidden for suspended users on /api/leads/[id]/pdf', async () => {
      const suspendedUser = await prisma.user.create({
        data: {
          name: 'Suspended PDF User',
          email: 'suspended-pdf@test.com',
          passwordHash: 'hash',
          role: 'DEVELOPER',
          status: 'SUSPENDED',
        },
      });

      await prisma.leadClaim.create({
        data: {
          leadId: testLeadId,
          userId: suspendedUser.id,
        },
      });

      const suspendedToken = await signSessionToken({
        userId: suspendedUser.id,
        email: suspendedUser.email,
        name: suspendedUser.name,
        role: 'DEVELOPER',
      });

      const pdfReq = new NextRequest(`http://localhost:3000/api/leads/${testLeadId}/pdf`, {
        headers: {
          Authorization: `Bearer ${suspendedToken}`,
        },
      });

      const pdfRes = await getLeadPdfRoute(pdfReq, { params: { id: testLeadId } });
      expect(pdfRes.status).toBe(403);
      const json = await pdfRes.json();
      expect(json.error).toContain('Forbidden');
    });
  });
});
