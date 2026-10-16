import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { ensureDbReady, prisma } from './db';

export const SESSION_COOKIE_NAME = 'leadforge_session';

export const DEFAULT_DEV_AUTH_SECRET =
  'leadforge-egypt-local-dev-secret-change-in-production-32chars';

export function resolveConfiguredAuthSecret(): string {
  const authSecret = process.env.AUTH_SECRET?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const candidate =
    authSecret && authSecret !== DEFAULT_DEV_AUTH_SECRET
      ? authSecret
      : jwtSecret && jwtSecret !== DEFAULT_DEV_AUTH_SECRET
      ? jwtSecret
      : authSecret || jwtSecret;

  if (process.env.NODE_ENV === 'production') {
    if (!candidate || candidate === DEFAULT_DEV_AUTH_SECRET || candidate.length < 32) {
      throw new Error(
        'Production AUTH_SECRET must be configured with a strong secret (at least 32 characters) and cannot use default dev secret.'
      );
    }
    return candidate;
  }

  return candidate || DEFAULT_DEV_AUTH_SECRET;
}

export function isProductionAuthSecretConfigured(): boolean {
  const authSecret = process.env.AUTH_SECRET?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const secret =
    authSecret && authSecret !== DEFAULT_DEV_AUTH_SECRET
      ? authSecret
      : jwtSecret && jwtSecret !== DEFAULT_DEV_AUTH_SECRET
      ? jwtSecret
      : '';
  return Boolean(secret && secret.length >= 32);
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(resolveConfiguredAuthSecret());
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: 'DEVELOPER' | 'ADMIN';
  iatMs?: number;
  exp?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let lastAuthSequenceMs = 0;

function nextAuthSequenceMs(): number {
  const now = Date.now();
  lastAuthSequenceMs = Math.max(now, lastAuthSequenceMs + 1);
  return lastAuthSequenceMs;
}

export async function signSessionToken(
  payload: Omit<SessionPayload, 'exp' | 'userId'> & { userId?: string; id?: string }
): Promise<string> {
  const resolvedUserId = payload.userId || payload.id || '';
  const iatMs = nextAuthSequenceMs();
  return new SignJWT({
    userId: resolvedUserId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    iatMs,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecretKey());
}

export const createSessionToken = signSessionToken;

const revokedTokens = new Set<string>();
const userSessionRevokedBeforeMs = new Map<string, number>();
let globalSessionsRevokedBeforeMs = 0;

export function revokeSessionToken(token: string): void {
  if (token) {
    revokedTokens.add(token.trim());
  }
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  if (userId) {
    const trimmed = userId.trim();
    const nowMs = nextAuthSequenceMs();
    userSessionRevokedBeforeMs.set(trimmed, nowMs);
    invalidateUserSessionCache(trimmed);
    try {
      if (prisma && typeof prisma.user?.update === 'function') {
        await prisma.user.update({
          where: { id: trimmed },
          data: { sessionsRevokedBefore: new Date(nowMs) },
        });
      }
    } catch {
      // Ignore if DB not ready
    }
  }
}

export function revokeAllSessions(): void {
  globalSessionsRevokedBeforeMs = nextAuthSequenceMs();
}

export function resetRevokedSessionsForTesting(): void {
  revokedTokens.clear();
  userSessionRevokedBeforeMs.clear();
  globalSessionsRevokedBeforeMs = 0;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    if (!token || revokedTokens.has(token.trim())) {
      return null;
    }
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.userId || !payload.role) return null;
    const userId = String(payload.userId);
    const tokenIatMs =
      typeof payload.iatMs === 'number'
        ? payload.iatMs
        : typeof payload.iat === 'number'
        ? payload.iat * 1000
        : 0;

    if (globalSessionsRevokedBeforeMs > 0 && tokenIatMs <= globalSessionsRevokedBeforeMs) {
      return null;
    }
    const userRevokedBefore = userSessionRevokedBeforeMs.get(userId);
    if (userRevokedBefore !== undefined && tokenIatMs <= userRevokedBefore) {
      return null;
    }

    try {
      if (prisma && typeof prisma.user?.findUnique === 'function') {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { sessionsRevokedBefore: true, status: true },
        });
        if (dbUser?.sessionsRevokedBefore) {
          const dbRevokedBeforeMs = new Date(dbUser.sessionsRevokedBefore).getTime();
          if (tokenIatMs <= dbRevokedBeforeMs) {
            return null;
          }
        }
      }
    } catch {
      // In-memory fallback if DB is not ready or during test bootstrapping
    }

    return {
      userId,
      email: String(payload.email || ''),
      name: String(payload.name || ''),
      role: payload.role as 'DEVELOPER' | 'ADMIN',
      iatMs: tokenIatMs,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(token: string) {
  const cookieStore = cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearSessionCookie() {
  const cookieStore = cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSessionFromRequest(req?: NextRequest): Promise<SessionPayload | null> {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }
  } else {
    try {
      const cookieStore = cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      token = undefined;
    }
  }

  if (!token) return null;
  return verifySessionToken(token);
}

const userSessionCache = new Map<string, { user: any; expiresAt: number }>();

export function invalidateUserSessionCache(userId?: string): void {
  if (userId) {
    userSessionCache.delete(userId);
  } else {
    userSessionCache.clear();
  }
}

export async function getCurrentUser(req?: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return null;

  const now = Date.now();
  const cached = userSessionCache.get(session.userId);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }

  await ensureDbReady();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      developerProfile: true,
      subscription: {
        include: { plan: true },
      },
    },
  });

  if (!user || user.status === 'SUSPENDED') {
    userSessionCache.delete(session.userId);
    return null;
  }

  if (user.sessionsRevokedBefore) {
    const revokedMs = new Date(user.sessionsRevokedBefore).getTime();
    const tokenIatMs = session.iatMs ?? 0;
    if (tokenIatMs <= revokedMs) {
      userSessionCache.delete(session.userId);
      return null;
    }
  }

  userSessionCache.set(session.userId, { user, expiresAt: now + 15_000 });
  return user;
}

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export async function requireAuth(req?: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    throw new AuthError('غير مصرح لك بالوصول. يرجى تسجيل الدخول أولاً.', 401);
  }
  return user;
}

export async function requireAdmin(req?: NextRequest) {
  const user = await requireAuth(req);
  if (user.role !== 'ADMIN') {
    throw new AuthError('صلاحيات غير كافية. هذه الصفحة مخصصة لمدير النظام فقط.', 403);
  }
  return user;
}

export function verifyCsrfOrigin(req: NextRequest): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;

  const expectedHost = (
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    req.nextUrl?.host ||
    ''
  )
    .split(',')[0]
    .trim()
    .toLowerCase();

  const origin = req.headers.get('origin');
  if (origin !== null) {
    const trimmedOrigin = origin.trim();
    if (!trimmedOrigin || trimmedOrigin.toLowerCase() === 'null' || !expectedHost) {
      return false;
    }
    try {
      const originUrl = new URL(trimmedOrigin);
      return originUrl.host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get('referer');
  if (referer !== null) {
    const trimmedReferer = referer.trim();
    if (!trimmedReferer || !expectedHost) {
      return false;
    }
    try {
      const refererUrl = new URL(trimmedReferer);
      return refererUrl.host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  }

  return true; // Server-side / non-browser call without Origin or Referer headers
}

export function getClientIp(req?: NextRequest | Request): string {
  if (!req) return 'unknown';
  const cfConnectingIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) {
    return cfConnectingIp.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp.split(',')[0].trim();
  }
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

export async function generatePasswordResetToken(user: {
  id: string;
  email: string;
  passwordHash: string;
}): Promise<string> {
  const secret = getSecretKey();
  const hashFingerprint = user.passwordHash.slice(-10);
  return new SignJWT({
    sub: user.id,
    email: user.email,
    hfp: hashFingerprint,
    type: 'pwd_reset',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secret);
}

export async function verifyPasswordResetToken(
  token: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== 'pwd_reset' || typeof payload.sub !== 'string') {
      return null;
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, passwordHash: true, status: true },
    });
    if (!user || user.status === 'SUSPENDED') return null;
    if (user.passwordHash.slice(-10) !== payload.hfp) {
      return null; // Automatically invalidated on password change
    }
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

