import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { ensureDbReady, prisma } from './db';

const SESSION_COOKIE_NAME = 'leadforge_session';

function getSecretKey(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET || 'leadforge-egypt-local-dev-secret-change-in-production-32chars';
  return new TextEncoder().encode(secret);
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

export async function signSessionToken(payload: Omit<SessionPayload, 'exp'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.userId || !payload.role) return null;
    return {
      userId: String(payload.userId),
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
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host) return true; // Same-origin or server-side test call without origin header
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}
