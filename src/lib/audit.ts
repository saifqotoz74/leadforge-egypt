import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from './db';

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
    return await db.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        details: (params.details ?? {}) as object,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch {
    return null;
  }
}
