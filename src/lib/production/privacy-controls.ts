/**
 * PHASE 10 — PRIVACY, LEGAL BASICS & USER DATA CONTROLS (SECTIONS 30 & 31)
 *
 * Implements:
 * - Developer personal data export (strictly scoped to owning developer)
 * - Controlled account deletion via PII anonymization + session revocation
 *   that preserves immutable financial (CreditTransaction, Payment), claim,
 *   and audit records.
 * - Production legal & privacy baseline metadata (no false certification claims).
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db';
import { revokeAllSessionsForUser } from '../auth';

export const PRODUCTION_LEGAL_AND_PRIVACY_NOTICES = {
  jurisdiction: 'Arab Republic of Egypt',
  privacyPolicySummary:
    'LeadForge Egypt collects developer account details, service/location preferences, and publicly available or authorized business lead information in Egypt. Personal account data is used strictly for authentication, deterministic lead matching, billing, and operational notifications.',
  termsOfServiceSummary:
    'Lead credits are non-transferable units used to unlock shared or exclusive business leads. Refunds are governed by deterministic verification rules (invalid contact, closed business, or confirmed duplicate).',
  cookieNoticeSummary:
    'LeadForge Egypt uses a strictly necessary HttpOnly, SameSite=Lax, HMAC-signed authentication session cookie (leadforge_session). No third-party advertising trackers are used.',
  acceptableUsePolicySummary:
    'Users must not scrape the platform, share unlocked exclusive leads externally, harass listed businesses, or attempt unauthorized access to other developer accounts.',
  supportContact: {
    email: 'support@leadforge.eg',
    securityDisclosureEmail: 'security@leadforge.eg',
    dataPrivacyRequestEndpoint: 'DELETE /api/developer/profile or GET /api/developer/profile?export=true',
  },
  complianceDisclaimer:
    'These operational controls implement practical data minimization, access control, and anonymization. No external ISO/SOC2 certification is claimed unless independently audited.',
} as const;

export interface DeveloperDataExportBundle {
  exportedAt: string;
  schemaVersion: 'USER_DATA_EXPORT_V1';
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    createdAt: Date;
  };
  developerProfile: unknown | null;
  subscription: unknown | null;
  creditAccount: {
    balance: number;
    lifetimePurchased: number;
    lifetimeBonus: number;
    lifetimeSpent: number;
    lifetimeRefunded: number;
  } | null;
  creditTransactions: unknown[];
  claims: Array<{
    id: string;
    leadId: string;
    accessType: string;
    status: string;
    creditsCharged: number;
    creditsRefunded: number;
    claimedAt: Date;
  }>;
  engagements: unknown[];
  feedbacks: unknown[];
  notifications: unknown[];
  payments: unknown[];
}

/**
 * Exports all personal and operational data belonging to a specific user.
 * Enforces strict tenant isolation.
 */
export async function exportDeveloperPersonalData(
  userId: string,
  db: PrismaClient = defaultPrisma
): Promise<DeveloperDataExportBundle> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      developerProfile: true,
      subscription: { include: { plan: true } },
      creditAccount: true,
      creditTransactions: { orderBy: { createdAt: 'desc' } },
      claims: {
        orderBy: { claimedAt: 'desc' },
        select: {
          id: true,
          leadId: true,
          accessType: true,
          status: true,
          creditsCharged: true,
          creditsRefunded: true,
          claimedAt: true,
        },
      },
      engagements: { orderBy: { createdAt: 'desc' } },
      feedbacks: { orderBy: { createdAt: 'desc' } },
      notifications: { orderBy: { createdAt: 'desc' }, take: 200 },
      payments: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_PERSONAL_DATA_EXPORTED',
      entityType: 'User',
      entityId: user.id,
      details: { exportedAt: new Date().toISOString() },
    },
  });

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 'USER_DATA_EXPORT_V1',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    },
    developerProfile: user.developerProfile,
    subscription: user.subscription,
    creditAccount: user.creditAccount
      ? {
          balance: user.creditAccount.balance,
          lifetimePurchased: user.creditAccount.lifetimePurchased,
          lifetimeBonus: user.creditAccount.lifetimeBonus,
          lifetimeSpent: user.creditAccount.lifetimeSpent,
          lifetimeRefunded: user.creditAccount.lifetimeRefunded,
        }
      : null,
    creditTransactions: user.creditTransactions,
    claims: user.claims,
    engagements: user.engagements,
    feedbacks: user.feedbacks,
    notifications: user.notifications,
    payments: user.payments,
  };
}

export interface AccountDeletionResult {
  userId: string;
  anonymizedEmail: string;
  status: 'SUSPENDED';
  sessionsRevoked: true;
  preservedImmutableRecords: {
    creditTransactionsCount: number;
    claimsCount: number;
    paymentsCount: number;
    auditLogsCount: number;
  };
  deletedAt: string;
}

/**
 * Controlled account deletion:
 * - Anonymizes PII on User and DeveloperProfile
 * - Suspends account and disables lead matching/acceptance
 * - Cancels active subscription
 * - Revokes all active sessions immediately
 * - Preserves immutable financial, claim, engagement, and audit records
 */
export async function anonymizeAndDeleteDeveloperAccount(
  params: {
    userId: string;
    actorId: string;
    reason?: string;
  },
  db: PrismaClient = defaultPrisma
): Promise<AccountDeletionResult> {
  const user = await db.user.findUnique({
    where: { id: params.userId },
    include: { developerProfile: true, subscription: true },
  });

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  if (user.role === 'ADMIN') {
    throw new Error('ADMIN_ACCOUNT_DELETION_FORBIDDEN');
  }

  const anonymizedEmail = `deleted_${user.id}@anonymized.leadforge.invalid`;
  const deletedAt = new Date().toISOString();

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        email: anonymizedEmail,
        name: 'Deleted Developer Account',
        passwordHash: 'ACCOUNT_DELETED_DISABLED_HASH',
        status: 'SUSPENDED',
      },
    });

    if (user.developerProfile) {
      await tx.developerProfile.update({
        where: { userId: user.id },
        data: {
          companyName: null,
          phone: null,
          bio: null,
          isActive: false,
          isAcceptingLeads: false,
        },
      });
    }

    if (user.subscription && user.subscription.status === 'ACTIVE') {
      await tx.subscription.update({
        where: { userId: user.id },
        data: { status: 'CANCELLED' },
      });
    }

    await tx.notification.deleteMany({
      where: { userId: user.id },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_ACCOUNT_ANONYMIZED_DELETED',
        entityType: 'User',
        entityId: user.id,
        details: {
          actorId: params.actorId,
          reason: params.reason || 'User requested account deletion',
          anonymizedAt: deletedAt,
        },
      },
    });
  });

  revokeAllSessionsForUser(user.id);

  const [creditTransactionsCount, claimsCount, paymentsCount, auditLogsCount] = await Promise.all([
    db.creditTransaction.count({ where: { developerId: user.id } }),
    db.leadClaim.count({ where: { userId: user.id } }),
    db.payment.count({ where: { userId: user.id } }),
    db.auditLog.count({ where: { userId: user.id } }),
  ]);

  return {
    userId: user.id,
    anonymizedEmail,
    status: 'SUSPENDED',
    sessionsRevoked: true,
    preservedImmutableRecords: {
      creditTransactionsCount,
      claimsCount,
      paymentsCount,
      auditLogsCount,
    },
    deletedAt,
  };
}
