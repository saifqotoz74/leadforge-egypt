import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { createInMemoryTestDb, setPrismaClientForTesting } from '@/lib/db';
import { hashPassword, signSessionToken, verifyPassword } from '@/lib/auth';
import { POST as changePasswordHandler } from '@/app/api/auth/change-password/route';

describe('Change Password & Security Alert Suite', () => {
  let prisma: PrismaClient;
  let cleanupDb: () => Promise<void>;
  let testUser: { id: string; email: string; name: string };
  let authToken: string;

  beforeAll(async () => {
    const testDb = await createInMemoryTestDb();
    prisma = testDb.prisma;
    cleanupDb = testDb.cleanup;
    setPrismaClientForTesting(testDb.prisma, testDb.pglite);

    const initialPasswordHash = await hashPassword('CurrentP@ss123');
    const user = await prisma.user.create({
      data: {
        email: 'developer.test@example.com',
        name: 'Saif Hossam',
        passwordHash: initialPasswordHash,
        role: 'DEVELOPER',
        status: 'ACTIVE',
      },
    });

    testUser = { id: user.id, email: user.email, name: user.name };
    authToken = await signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: 'DEVELOPER',
    });
  });

  afterAll(async () => {
    if (cleanupDb) {
      await cleanupDb();
    }
  });

  function createRequest(body: any, token?: string, csrf = true) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      host: 'localhost:3000',
    };
    if (csrf) {
      headers['origin'] = 'http://localhost:3000';
    }
    if (token) {
      headers['authorization'] = `Bearer ${token}`;
      headers['cookie'] = `leadforge_session=${token}`;
    }

    return new NextRequest('http://localhost:3000/api/auth/change-password', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  it('rejects unauthenticated requests with 401', async () => {
    const req = createRequest({
      currentPassword: 'CurrentP@ss123',
      newPassword: 'BrandNewP@ss456',
      confirmPassword: 'BrandNewP@ss456',
    });

    const res = await changePasswordHandler(req);
    expect(res.status).toBe(401);
  });

  it('rejects non-matching confirmPassword with 400', async () => {
    const req = createRequest(
      {
        currentPassword: 'CurrentP@ss123',
        newPassword: 'BrandNewP@ss456',
        confirmPassword: 'DifferentP@ss789',
      },
      authToken
    );

    const res = await changePasswordHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('كلمتا المرور غير متطابقتين');
  });

  it('rejects weak new passwords (too short or missing digits)', async () => {
    const reqShort = createRequest(
      {
        currentPassword: 'CurrentP@ss123',
        newPassword: 'Short1',
        confirmPassword: 'Short1',
      },
      authToken
    );

    const resShort = await changePasswordHandler(reqShort);
    expect(resShort.status).toBe(400);
    const dataShort = await resShort.json();
    expect(dataShort.error).toContain('8 أحرف');

    const reqNoDigit = createRequest(
      {
        currentPassword: 'CurrentP@ss123',
        newPassword: 'LettersOnlyPassword',
        confirmPassword: 'LettersOnlyPassword',
      },
      authToken
    );

    const resNoDigit = await changePasswordHandler(reqNoDigit);
    expect(resNoDigit.status).toBe(400);
    const dataNoDigit = await resNoDigit.json();
    expect(dataNoDigit.error).toContain('رقم واحد');
  });

  it('rejects wrong current password with 400 and INVALID_CURRENT_PASSWORD', async () => {
    const req = createRequest(
      {
        currentPassword: 'WrongPassword999',
        newPassword: 'BrandNewP@ss456',
        confirmPassword: 'BrandNewP@ss456',
      },
      authToken
    );

    const res = await changePasswordHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('rejects identical new password with 400 and SAME_PASSWORD', async () => {
    const req = createRequest(
      {
        currentPassword: 'CurrentP@ss123',
        newPassword: 'CurrentP@ss123',
        confirmPassword: 'CurrentP@ss123',
      },
      authToken
    );

    const res = await changePasswordHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('SAME_PASSWORD');
  });

  it('successfully changes password, updates DB hash, and dispatches in-app notification', async () => {
    const req = createRequest(
      {
        currentPassword: 'CurrentP@ss123',
        newPassword: 'BrandNewP@ss456',
        confirmPassword: 'BrandNewP@ss456',
      },
      authToken
    );

    const res = await changePasswordHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify DB user hash updated
    const updatedUser = await prisma.user.findUnique({
      where: { id: testUser.id },
    });
    expect(updatedUser).toBeDefined();
    const isOldValid = await verifyPassword('CurrentP@ss123', updatedUser!.passwordHash);
    expect(isOldValid).toBe(false);
    const isNewValid = await verifyPassword('BrandNewP@ss456', updatedUser!.passwordHash);
    expect(isNewValid).toBe(true);

    // Verify In-App Notification created
    const notifications = await prisma.notification.findMany({
      where: { userId: testUser.id },
    });
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    const securityNotification = notifications.find((n) =>
      n.title.includes('تغيير كلمة المرور')
    );
    expect(securityNotification).toBeDefined();
    expect(securityNotification?.type).toBe('SYSTEM');
  });
});
