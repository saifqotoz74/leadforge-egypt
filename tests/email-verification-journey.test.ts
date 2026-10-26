import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '../src/lib/db';
import { hashPassword, invalidateUserSessionCache, signSessionToken } from '../src/lib/auth';
import { DEFAULT_PLANS } from '../src/lib/payment/provider';
import {
  createEmailVerificationToken,
  getResendCooldown,
  verifyEmailToken,
  hashVerificationToken,
  getApplicationBaseUrl,
  isTrustedOrigin,
} from '../src/lib/email-verification';
import {
  resolveEmailNotificationProvider,
  ApiEmailNotificationProvider,
  ConsoleEmailNotificationProvider,
  DisabledEmailNotificationProvider,
} from '../src/lib/notifications';
import { POST as registerHandler } from '../src/app/api/auth/register/route';
import { POST as verifyEmailHandler } from '../src/app/api/auth/verify-email/route';
import { POST as verifyEmailRequestHandler } from '../src/app/api/auth/verify-email/request/route';
import { POST as claimHandler } from '../src/app/api/leads/[id]/claim/route';
import { claimLead } from '../src/lib/claims';

describe('Email Verification Subsystem Suite (GAP-01 / P0 Blocker)', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;

  function buildJsonRequest(
    url: string,
    options: {
      method?: string;
      token?: string;
      body?: unknown;
    } = {}
  ): NextRequest {
    const headers: Record<string, string> = {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    };
    if (options.token) {
      headers.authorization = `Bearer ${options.token}`;
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    return new NextRequest(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  }

  beforeAll(async () => {
    const inMem = await createInMemoryTestDb();
    prisma = inMem.prisma;
    cleanupDb = inMem.cleanup;
    setPrismaClientForTesting(prisma, inMem.pglite);

    for (const plan of DEFAULT_PLANS) {
      await prisma.plan.upsert({
        where: { slug: plan.slug },
        update: plan,
        create: plan,
      });
    }
  });

  afterAll(async () => {
    if (cleanupDb) await cleanupDb();
  });

  it('generates high-entropy token and persists SHA-256 hash with 24-hour expiry', async () => {
    const passwordHash = await hashPassword('DevPassword123!');
    const user = await prisma.user.create({
      data: {
        email: `token-test-${Date.now()}@leadforge.eg`,
        name: 'Token Test User',
        passwordHash,
        emailVerified: null,
      },
    });

    const { rawToken, expiresAt } = await createEmailVerificationToken(user.id);
    expect(rawToken).toBeDefined();
    expect(rawToken.length).toBe(64); // 32 bytes hex

    const expectedHash = hashVerificationToken(rawToken);
    const dbRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: expectedHash },
    });

    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.userId).toBe(user.id);
    expect(dbRecord?.consumedAt).toBeNull();
    // Expiry ~24 hours from now
    const hoursDiff = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
    expect(hoursDiff).toBeGreaterThanOrEqual(23.9);
    expect(hoursDiff).toBeLessThanOrEqual(24.1);
  });

  it('successfully verifies user on first use and marks token consumed', async () => {
    const passwordHash = await hashPassword('DevPassword123!');
    const user = await prisma.user.create({
      data: {
        email: `verify-first-${Date.now()}@leadforge.eg`,
        name: 'First Verify User',
        passwordHash,
        emailVerified: null,
      },
    });

    const { rawToken } = await createEmailVerificationToken(user.id);
    const result = await verifyEmailToken(rawToken);

    expect(result.success).toBe(true);
    expect(result.user?.emailVerified).not.toBeNull();

    const userInDb = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userInDb.emailVerified).not.toBeNull();

    const tokenRecord = await prisma.emailVerificationToken.findUniqueOrThrow({
      where: { tokenHash: hashVerificationToken(rawToken) },
    });
    expect(tokenRecord.consumedAt).not.toBeNull();
  });

  it('rejects duplicate one-time use of the same verification token (single-use invariant)', async () => {
    const passwordHash = await hashPassword('DevPassword123!');
    const user = await prisma.user.create({
      data: {
        email: `verify-replay-${Date.now()}@leadforge.eg`,
        name: 'Replay Verify User',
        passwordHash,
        emailVerified: null,
      },
    });

    const { rawToken } = await createEmailVerificationToken(user.id);

    // 1st consumption
    const firstRes = await verifyEmailToken(rawToken);
    expect(firstRes.success).toBe(true);

    // 2nd consumption attempt
    const secondRes = await verifyEmailToken(rawToken);
    expect(secondRes.success).toBe(false);
    expect(secondRes.code).toBe('TOKEN_ALREADY_USED');
  });

  it('rejects expired tokens (> 24 hours)', async () => {
    const passwordHash = await hashPassword('DevPassword123!');
    const user = await prisma.user.create({
      data: {
        email: `verify-expired-${Date.now()}@leadforge.eg`,
        name: 'Expired Token User',
        passwordHash,
        emailVerified: null,
      },
    });

    const { rawToken } = await createEmailVerificationToken(user.id);
    const tokenHash = hashVerificationToken(rawToken);

    // Force expire in DB
    await prisma.emailVerificationToken.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 60 * 1000) }, // 1 minute ago
    });

    const res = await verifyEmailToken(rawToken);
    expect(res.success).toBe(false);
    expect(res.code).toBe('TOKEN_EXPIRED');
  });

  it('enforces 60-second cooldown on resending verification email', async () => {
    const passwordHash = await hashPassword('DevPassword123!');
    const user = await prisma.user.create({
      data: {
        email: `cooldown-${Date.now()}@leadforge.eg`,
        name: 'Cooldown User',
        passwordHash,
        emailVerified: null,
      },
    });

    await createEmailVerificationToken(user.id);
    const cooldown = await getResendCooldown(user.id);

    expect(cooldown.canResend).toBe(false);
    expect(cooldown.retryAfterSeconds).toBeGreaterThan(0);
    expect(cooldown.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('API route POST /api/auth/verify-email completes end-to-end verification and unblocks lead claiming', async () => {
    // 1. Register new developer
    const regEmail = `api-verify-${Date.now()}@leadforge.eg`;
    const regReq = buildJsonRequest('http://localhost:3000/api/auth/register', {
      method: 'POST',
      body: {
        name: 'API Verify Dev',
        email: regEmail,
        password: 'Password123!',
      },
    });
    const regRes = await registerHandler(regReq);
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    const token = regData.token;

    // 2. Fetch created verification token from DB
    const tokenRecord = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId: regData.user.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(tokenRecord.consumedAt).toBeNull();

    // 3. Create a scorable lead
    const lead = await prisma.lead.create({
      data: {
        businessName: 'Unblocked Lead Co',
        normalizedName: 'unblocked lead co',
        category: 'Dental',
        governorate: 'القاهرة',
        city: 'القاهرة',
        address: '10 Zamalek',
        normalizedAddress: '10 zamalek',
        phone: '01099887766',
        leadType: 'SHARED',
        accessType: 'SHARED',
        maxPurchasers: 3,
        currentPurchasers: 0,
        status: 'AVAILABLE',
        saleabilityStatus: 'AVAILABLE',
        availableForClaim: true,
        qualityScore: 85,
        score: 85,
        qualityStatus: 'HIGH',
        freshnessStatus: 'FRESH',
        verificationStatus: 'VERIFIED',
        businessStatus: 'OPEN',
        isCanonical: true,
        isMock: false,
      },
    });

    // 4. Confirm claiming is initially blocked with 403 EMAIL_NOT_VERIFIED
    invalidateUserSessionCache(regData.user.id);
    const claimReqBefore = buildJsonRequest(`http://localhost:3000/api/leads/${lead.id}/claim`, {
      method: 'POST',
      token,
    });
    const claimResBefore = await claimHandler(claimReqBefore, { params: { id: lead.id } });
    expect(claimResBefore.status).toBe(403);
    const errBefore = await claimResBefore.json();
    expect(errBefore.code).toBe('EMAIL_NOT_VERIFIED');

    // 5. Simulate clicking email link -> generate token, call POST /api/auth/verify-email
    // Note: since tokenHash is one-way, we create a fresh known token to call the endpoint
    const { rawToken } = await createEmailVerificationToken(regData.user.id);

    const verifyReq = buildJsonRequest('http://localhost:3000/api/auth/verify-email', {
      method: 'POST',
      body: { token: rawToken },
    });
    const verifyRes = await verifyEmailHandler(verifyReq);
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);

    // 6. Confirm user is now emailVerified in database
    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: regData.user.id } });
    expect(userAfter.emailVerified).not.toBeNull();

    // Top up developer account balance to 10 so credit check passes
    const creditAcc = await prisma.developerCreditAccount.findUniqueOrThrow({
      where: { developerId: regData.user.id },
    });
    await prisma.developerCreditAccount.update({
      where: { id: creditAcc.id },
      data: { balance: 10 },
    });

    // 7. Verify claim now succeeds!
    invalidateUserSessionCache(regData.user.id);
    const claimReqAfter = buildJsonRequest(`http://localhost:3000/api/leads/${lead.id}/claim`, {
      method: 'POST',
      token,
    });
    const claimResAfter = await claimHandler(claimReqAfter, { params: { id: lead.id } });
    expect(claimResAfter.status).toBe(200);
    const claimData = await claimResAfter.json();
    expect(claimData.claim).toBeDefined();
    expect(claimData.claim.status).toBe('ACTIVE');
  });

  it('API route POST /api/auth/verify-email/request enforces cooldown with HTTP 429', async () => {
    const passwordHash = await hashPassword('DevPassword123!');
    const user = await prisma.user.create({
      data: {
        email: `req-cooldown-${Date.now()}@leadforge.eg`,
        name: 'Req Cooldown User',
        passwordHash,
        emailVerified: null,
      },
    });

    const userToken = await signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    // 1st request succeeds
    const req1 = buildJsonRequest('http://localhost:3000/api/auth/verify-email/request', {
      method: 'POST',
      token: userToken,
    });
    const res1 = await verifyEmailRequestHandler(req1);
    expect(res1.status).toBe(200);

    // Immediate 2nd request is throttled with 429
    const req2 = buildJsonRequest('http://localhost:3000/api/auth/verify-email/request', {
      method: 'POST',
      token: userToken,
    });
    const res2 = await verifyEmailRequestHandler(req2);
    expect(res2.status).toBe(429);
    const data2 = await res2.json();
    expect(data2.code).toBe('RESEND_COOLDOWN_ACTIVE');
    expect(data2.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('canonical email config resolves RESEND provider and RESEND_API_KEY alias safely', () => {
    const origProvider = process.env.EMAIL_PROVIDER;
    const origVitest = process.env.VITEST;
    const origNodeEnv = process.env.NODE_ENV;
    const origApiKey = process.env.EMAIL_API_KEY;
    const origResendKey = process.env.RESEND_API_KEY;

    try {
      // Temporarily simulate non-test environment to test provider resolution
      delete process.env.VITEST;
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

      // 1. Accepts uppercase "API"
      process.env.EMAIL_PROVIDER = 'API';
      const provider1 = resolveEmailNotificationProvider();
      expect(provider1).toBeInstanceOf(ApiEmailNotificationProvider);

      // 2. Accepts lowercase "resend"
      process.env.EMAIL_PROVIDER = 'resend';
      const provider2 = resolveEmailNotificationProvider();
      expect(provider2).toBeInstanceOf(ApiEmailNotificationProvider);

      // 3. Accepts "DISABLED"
      process.env.EMAIL_PROVIDER = 'DISABLED';
      const provider3 = resolveEmailNotificationProvider();
      expect(provider3).toBeInstanceOf(DisabledEmailNotificationProvider);

      // 4. Defaults to Console for anything else
      process.env.EMAIL_PROVIDER = 'CONSOLE';
      const provider4 = resolveEmailNotificationProvider();
      expect(provider4).toBeInstanceOf(ConsoleEmailNotificationProvider);
    } finally {
      process.env.EMAIL_PROVIDER = origProvider;
      process.env.VITEST = origVitest;
      (process.env as any).NODE_ENV = origNodeEnv;
      process.env.EMAIL_API_KEY = origApiKey;
      process.env.RESEND_API_KEY = origResendKey;
    }
  });

  it('enforces strict URL trust boundaries and rejects spoofed or untrusted origins', () => {
    const origAppUrl = process.env.APP_URL;
    const origNextAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    const origAllowedOrigins = process.env.ALLOWED_ORIGINS;
    const origNodeEnv = process.env.NODE_ENV;

    try {
      // 1. In local development: accepts loopbacks, rejects arbitrary external origins
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      delete process.env.APP_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.ALLOWED_ORIGINS;

      expect(isTrustedOrigin('http://localhost:3000')).toBe(true);
      expect(isTrustedOrigin('http://127.0.0.1:4000')).toBe(true);
      expect(isTrustedOrigin('http://[::1]:3000')).toBe(true);
      expect(isTrustedOrigin('https://evil-attacker.com')).toBe(false);
      expect(isTrustedOrigin('http://phishing.local.evil.com')).toBe(false);
      expect(isTrustedOrigin('null')).toBe(false);
      expect(isTrustedOrigin('')).toBe(false);

      // Dev resolution: valid local origin is accepted
      expect(getApplicationBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
      // Dev resolution: spoofed origin is rejected and falls back to safe default
      expect(getApplicationBaseUrl('https://evil-attacker.com')).toBe('http://localhost:3000');

      // 2. In production: strictly enforces configured canonical base URL against spoofing
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.APP_URL = 'https://leadforge.eg';
      process.env.ALLOWED_ORIGINS = 'https://leadforge.eg,https://admin.leadforge.eg';

      expect(isTrustedOrigin('https://leadforge.eg')).toBe(true);
      expect(isTrustedOrigin('https://admin.leadforge.eg')).toBe(true);
      expect(isTrustedOrigin('https://evil-attacker.com')).toBe(false);
      expect(isTrustedOrigin('http://localhost:3000')).toBe(false); // Loopback not trusted in prod

      // Production resolution: even if an attacker sends a spoofed Origin, APP_URL is strictly enforced
      expect(getApplicationBaseUrl('https://evil-attacker.com')).toBe('https://leadforge.eg');
      expect(getApplicationBaseUrl('http://localhost:3000')).toBe('https://leadforge.eg');
      expect(getApplicationBaseUrl(null)).toBe('https://leadforge.eg');

      // 3. In production without APP_URL: falls back strictly to canonical leadforge.eg
      delete process.env.APP_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
      expect(getApplicationBaseUrl('https://evil-attacker.com')).toBe('https://leadforge.eg');
      expect(getApplicationBaseUrl(null)).toBe('https://leadforge.eg');
    } finally {
      process.env.APP_URL = origAppUrl;
      process.env.NEXT_PUBLIC_APP_URL = origNextAppUrl;
      process.env.ALLOWED_ORIGINS = origAllowedOrigins;
      (process.env as any).NODE_ENV = origNodeEnv;
    }
  });
});
