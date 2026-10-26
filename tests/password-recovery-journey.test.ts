import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '../src/lib/db';
import {
  hashPassword,
  verifyPassword,
  generatePasswordResetToken,
  verifyPasswordResetToken,
} from '../src/lib/auth';
import { POST as forgotPasswordHandler } from '../src/app/api/auth/forgot-password/route';
import { POST as resetPasswordHandler } from '../src/app/api/auth/reset-password/route';
import { POST as loginHandler } from '../src/app/api/auth/login/route';

describe('Password Recovery Journey Suite (Priority 2 / UX-010)', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;

  function buildJsonRequest(
    url: string,
    options: {
      method?: string;
      body?: unknown;
    } = {}
  ): NextRequest {
    const headers: Record<string, string> = {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    };
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    return new NextRequest(url, {
      method: options.method ?? 'POST',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  }

  beforeAll(async () => {
    const inMem = await createInMemoryTestDb();
    prisma = inMem.prisma;
    cleanupDb = inMem.cleanup;
    setPrismaClientForTesting(prisma, inMem.pglite);
  });

  afterAll(async () => {
    if (cleanupDb) await cleanupDb();
  });

  it('forgot-password endpoint returns 200 with anti-enumeration message', async () => {
    const email = `forgot-${Date.now()}@leadforge.eg`;
    const passwordHash = await hashPassword('InitialPass123!');
    await prisma.user.create({
      data: {
        email,
        name: 'Forgot Test User',
        passwordHash,
      },
    });

    // Valid registered email
    const req1 = buildJsonRequest('http://localhost:3000/api/auth/forgot-password', {
      body: { email },
    });
    const res1 = await forgotPasswordHandler(req1);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.success).toBe(true);

    // Non-existent email still returns 200 (anti-enumeration)
    const req2 = buildJsonRequest('http://localhost:3000/api/auth/forgot-password', {
      body: { email: 'nonexistent@leadforge.eg' },
    });
    const res2 = await forgotPasswordHandler(req2);
    expect(res2.status).toBe(200);

    // Cross-origin spoofed Origin is blocked by CSRF guard with 403
    const spoofedReq = new NextRequest('http://localhost:3000/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        origin: 'https://evil-attacker.com',
        host: 'localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const resSpoofed = await forgotPasswordHandler(spoofedReq);
    expect(resSpoofed.status).toBe(403);
  });

  it('generates cryptographic reset token and verifies hash fingerprint', async () => {
    const email = `crypto-reset-${Date.now()}@leadforge.eg`;
    const passwordHash = await hashPassword('OriginalPass123!');
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Crypto Reset User',
        passwordHash,
      },
    });

    const token = await generatePasswordResetToken(user);
    expect(token).toBeDefined();

    const verified = await verifyPasswordResetToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(user.id);
  });

  it('completes password reset, revokes prior sessions, and enforces single-use token invalidation', async () => {
    const email = `single-use-${Date.now()}@leadforge.eg`;
    const oldPassword = 'OldPassword123!';
    const newPassword = 'NewSecurePassword456!';
    const passwordHash = await hashPassword(oldPassword);

    const user = await prisma.user.create({
      data: {
        email,
        name: 'Single Use User',
        passwordHash,
      },
    });

    const token = await generatePasswordResetToken(user);

    // 1. Reset password via API
    const resetReq = buildJsonRequest('http://localhost:3000/api/auth/reset-password', {
      body: { token, password: newPassword },
    });
    const resetRes = await resetPasswordHandler(resetReq);
    expect(resetRes.status).toBe(200);
    const resetData = await resetRes.json();
    expect(resetData.success).toBe(true);

    // 2. Database verification: passwordHash updated and sessionsRevokedBefore is set
    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(userAfter.passwordHash).not.toBe(passwordHash);
    expect(userAfter.sessionsRevokedBefore).not.toBeNull();

    // 3. Single-use enforcement: replaying the same token must fail!
    const replayReq = buildJsonRequest('http://localhost:3000/api/auth/reset-password', {
      body: { token, password: 'AnotherPassword789!' },
    });
    const replayRes = await resetPasswordHandler(replayReq);
    expect(replayRes.status).toBe(400);
    const replayData = await replayRes.json();
    expect(replayData.code).toBe('TOKEN_EXPIRED_OR_INVALID');

    // 4. Login verification: old password fails, new password succeeds
    const oldLoginReq = buildJsonRequest('http://localhost:3000/api/auth/login', {
      body: { email, password: oldPassword },
    });
    const oldLoginRes = await loginHandler(oldLoginReq);
    expect(oldLoginRes.status).toBe(401);

    const newLoginReq = buildJsonRequest('http://localhost:3000/api/auth/login', {
      body: { email, password: newPassword },
    });
    const newLoginRes = await loginHandler(newLoginReq);
    expect(newLoginRes.status).toBe(200);
  });
});
