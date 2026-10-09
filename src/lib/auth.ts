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
  if (authSecret && authSecret !== DEFAULT_DEV_AUTH_SECRET) {
    return authSecret;
  }
  if (jwtSecret && jwtSecret !== DEFAULT_DEV_AUTH_SECRET) {
    return jwtSecret;
  }
  return authSecret || jwtSecret || DEFAULT_DEV_AUTH_SECRET;
}

export function isProductionAuthSecretConfigured(): boolean {
  const secret = resolveConfiguredAuthSecret();
  return Boolean(secret && secret !== DEFAULT_DEV_AUTH_SECRET);
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(resolveConfiguredAuthSecret());
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: 'DEVELOPER' | 'ADMIN';
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

export function revokeAllSessionsForUser(userId: string): void {
  if (userId) {
    userSessionRevokedBeforeMs.set(userId.trim(), nextAuthSequenceMs());
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

    return {
      userId,
      email: String(payload.email || ''),
      name: String(payload.name || ''),
      role: payload.role as 'DEVELOPER' | 'ADMIN',
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

export async function getCurrentUser(req?: NextRequest) {
  await ensureDbReady();
  const session = await getSessionFromRequest(req);
  if (!session) return null;

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
    return null;
  }

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
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || 'unknown';
}
