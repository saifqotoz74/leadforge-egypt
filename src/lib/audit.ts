import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './db';
import { redactSensitiveData } from './security/error-taxonomy';

export async function createAuditLog(
  params: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown> | null;
    ipAddress?: string | null;
  },
  db: PrismaClient = defaultPrisma
) {
  try {
    const sanitizedDetails = (redactSensitiveData(params.details ?? {}) ?? {}) as object;
    return await db.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        details: sanitizedDetails,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch {
    return null;
  }
}
