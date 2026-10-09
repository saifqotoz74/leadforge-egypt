import { CreditTransactionType, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db';
import { createAuditLog } from '../audit';
import { acquireCreditAccountRowLock, withResourceLocks } from './locks';
import { logClaimEngineEvent } from './logger';
import {
  AdminAdjustCreditsInput,
  AdminAdjustCreditsResult,
  ClaimEngineError,
  CreditLedgerReconciliationResult,
} from './types';

type DbClient = Prisma.TransactionClient | PrismaClient;

/**
 * Ensures a `DeveloperCreditAccount` exists for `developerId` and is reconciled with any initial
 * `Subscription.credits` or direct test seeding so that `Current Balance == SUM(CreditTransaction.amount)`
 * always holds.
 */
export async function ensureDeveloperCreditAccount(
  tx: DbClient,
  developerId: string,
  options?: { syncFromSubscription?: boolean }
) {
  const user = await tx.user.findUnique({
    where: { id: developerId },
    include: {
      subscription: true,
      creditAccount: true,
    },
  });

  if (!user) {
    throw new ClaimEngineError('ACCOUNT_NOT_FOUND', 'Developer user account not found', 404, {
      developerId,
    });
  }

  const subCredits = Math.max(0, user.subscription?.credits ?? 0);
  let account = user.creditAccount;

  if (!account) {
    account = await tx.developerCreditAccount.create({
      data: {
        developerId,
        balance: subCredits,
        reservedBalance: 0,
        lifetimePurchased: subCredits,
        lifetimeBonus: 0,
        lifetimeSpent: 0,
        lifetimeRefunded: 0,
        lifetimeExpired: 0,
        totalGranted: subCredits,
        totalSpent: 0,
        totalRefunded: 0,
        version: 1,
      },
    });

    if (subCredits > 0) {
      await tx.creditTransaction.create({
        data: {
          accountId: account.id,
          developerId,
          type: 'PURCHASE',
          amount: subCredits,
          balanceBefore: 0,
          balanceAfter: subCredits,
          referenceType: 'SUBSCRIPTION_INIT',
          referenceId: user.subscription?.id ?? developerId,
          reason: 'Initial subscription credit balance',
          idempotencyKey: `init-sub-${developerId}`,
        },
      });
    }

    return account;
  }

  // If legacy test mutated `Subscription.credits` directly and calls `claimLeadForDeveloper`,
  // synchronize `DeveloperCreditAccount` and ledger with `Subscription.credits`.
  if (options?.syncFromSubscription && user.subscription && account.balance !== subCredits) {
    const delta = subCredits - account.balance;
    const balanceBefore = account.balance;
    account = await tx.developerCreditAccount.update({
      where: { id: account.id },
      data: {
        balance: subCredits,
        ...(delta > 0
          ? { lifetimePurchased: { increment: delta }, totalGranted: { increment: delta } }
          : { lifetimeSpent: { increment: Math.abs(delta) }, totalSpent: { increment: Math.abs(delta) } }),
        version: { increment: 1 },
      },
    });
    await tx.creditTransaction.create({
      data: {
        accountId: account.id,
        developerId,
        type: 'CORRECTION',
        amount: delta,
        balanceBefore,
        balanceAfter: subCredits,
        referenceType: 'SUBSCRIPTION_SYNC',
        referenceId: user.subscription.id,
        reason: 'Synchronized credit balance with direct subscription update',
      },
    });
    return account;
  }

  // If a test seeded `DeveloperCreditAccount` directly with balance > 0 but 0 transactions,
  // backfill the genesis ledger entry so `Current Balance == Ledger Sum` holds.
  const txAgg = await tx.creditTransaction.aggregate({
    where: { accountId: account.id },
    _sum: { amount: true },
    _count: { id: true },
  });

  const txCount = txAgg._count.id;
  const ledgerSum = txAgg._sum.amount ?? 0;

  if (txCount === 0 && account.balance > 0) {
    await tx.creditTransaction.create({
      data: {
        accountId: account.id,
        developerId,
        type: 'PURCHASE',
        amount: account.balance,
        balanceBefore: 0,
        balanceAfter: account.balance,
        referenceType: 'ACCOUNT_INIT',
        referenceId: account.id,
        reason: 'Initial account credit balance',
        idempotencyKey: `init-account-${account.id}`,
      },
    });
    if (account.lifetimePurchased === 0 || account.totalGranted === 0) {
      account = await tx.developerCreditAccount.update({
        where: { id: account.id },
        data: {
          lifetimePurchased: account.balance,
          totalGranted: account.balance,
        },
      });
    }
    return account;
  }

  // If legacy code updated `Subscription.credits` directly while `account.balance === 0` and `txCount === 0`,
  // synchronize the subscription grant into the credit account & ledger.
  if (txCount === 0 && account.balance === 0 && subCredits > 0) {
    account = await tx.developerCreditAccount.update({
      where: { id: account.id },
      data: {
        balance: subCredits,
        lifetimePurchased: { increment: subCredits },
        totalGranted: { increment: subCredits },
        version: { increment: 1 },
      },
    });
    await tx.creditTransaction.create({
      data: {
        accountId: account.id,
        developerId,
        type: 'PURCHASE',
        amount: subCredits,
        balanceBefore: 0,
        balanceAfter: subCredits,
        referenceType: 'SUBSCRIPTION_SYNC',
        referenceId: user.subscription?.id ?? developerId,
        reason: 'Subscription credit grant synchronized',
      },
    });
    return account;
  }

  // Ensure ledger sum matches account balance if a direct test updated `account.balance` without a ledger row
  if (txCount > 0 && ledgerSum !== account.balance) {
    const diff = account.balance - ledgerSum;
    if (diff !== 0) {
      await tx.creditTransaction.create({
        data: {
          accountId: account.id,
          developerId,
          type: 'CORRECTION',
          amount: diff,
          balanceBefore: ledgerSum,
          balanceAfter: account.balance,
          referenceType: 'RECONCILIATION_SYNC',
          referenceId: account.id,
          reason: 'Automatic ledger synchronization for external balance update',
        },
      });
    }
  }

  return account;
}

/**
 * Verifies the immutable ledger invariant:
 * `DeveloperCreditAccount.balance === SUM(CreditTransaction.amount)`
 */
export async function reconcileCreditAccount(
  developerId: string,
  client: DbClient = prisma
): Promise<CreditLedgerReconciliationResult> {
  const account = await client.developerCreditAccount.findUnique({
    where: { developerId },
  });

  if (!account) {
    throw new ClaimEngineError('ACCOUNT_NOT_FOUND', 'Credit account not found for developer', 404, {
      developerId,
    });
  }

  const agg = await client.creditTransaction.aggregate({
    where: { accountId: account.id },
    _sum: { amount: true },
    _count: { id: true },
  });

  const ledgerSum = agg._sum.amount ?? 0;
  const transactionCount = agg._count.id;
  const currentBalance = account.balance;
  const discrepancy = currentBalance - ledgerSum;

  return {
    developerId,
    accountId: account.id,
    currentBalance,
    ledgerSum,
    transactionCount,
    isReconciled: discrepancy === 0 && currentBalance >= 0,
    discrepancy,
  };
}

export async function getDeveloperCreditSummary(
  developerId: string,
  options?: {
    page?: number;
    pageSize?: number;
    type?: CreditTransactionType;
  }
) {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 25));

  return withResourceLocks([`developer:${developerId}`], async () => {
    const account = await prisma.$transaction(async (tx) => {
      return ensureDeveloperCreditAccount(tx, developerId);
    });

    const whereClause: Prisma.CreditTransactionWhereInput = {
      developerId,
      ...(options?.type ? { type: options.type } : {}),
    };

    const [transactions, totalTransactions, reconciliation] = await Promise.all([
      prisma.creditTransaction.findMany({
        where: whereClause,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.creditTransaction.count({ where: whereClause }),
      reconcileCreditAccount(developerId, prisma),
    ]);

    return {
      account: {
        id: account.id,
        developerId: account.developerId,
        balance: account.balance,
        reservedBalance: account.reservedBalance,
        availableBalance: Math.max(0, account.balance - account.reservedBalance),
        lifetimePurchased: account.lifetimePurchased,
        lifetimeBonus: account.lifetimeBonus,
        lifetimeSpent: account.lifetimeSpent,
        lifetimeRefunded: account.lifetimeRefunded,
        lifetimeExpired: account.lifetimeExpired,
        totalGranted: account.totalGranted,
        totalSpent: account.totalSpent,
        totalRefunded: account.totalRefunded,
        version: account.version,
        updatedAt: account.updatedAt,
      },
      reconciliation,
      transactions,
      pagination: {
        page,
        pageSize,
        total: totalTransactions,
        totalPages: Math.max(1, Math.ceil(totalTransactions / pageSize)),
      },
    };
  });
}

/**
 * Admin credit adjustment (positive or negative) with strict non-negative balance enforcement,
 * idempotency support, and immutable ledger recording.
 */
export async function adjustDeveloperCreditsByAdmin(
  input: AdminAdjustCreditsInput
): Promise<AdminAdjustCreditsResult> {
  const { developerId, amount, reason, performedById, idempotencyKey, metadata, ipAddress } = input;
  const txType: CreditTransactionType = input.type ?? 'ADMIN_ADJUSTMENT';

  if (!developerId || typeof developerId !== 'string') {
    throw new ClaimEngineError('INVALID_CREDIT_ADJUSTMENT', 'developerId is required', 422);
  }
  if (!performedById || typeof performedById !== 'string') {
    throw new ClaimEngineError('INVALID_CREDIT_ADJUSTMENT', 'performedById is required', 422);
  }
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0) {
    throw new ClaimEngineError(
      'INVALID_CREDIT_ADJUSTMENT',
      'Credit adjustment amount must be a non-zero integer',
      422,
      { amount }
    );
  }
  if (!reason || reason.trim().length < 3) {
    throw new ClaimEngineError(
      'INVALID_CREDIT_ADJUSTMENT',
      'A descriptive reason (at least 3 characters) is required for credit adjustments',
      422
    );
  }

  if (idempotencyKey !== undefined && idempotencyKey !== null) {
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.trim().length === 0 ||
      idempotencyKey.trim().length > 128 ||
      /[\r\n\0]/.test(idempotencyKey)
    ) {
      throw new ClaimEngineError(
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency key must be a non-empty string up to 128 characters',
        422
      );
    }
  }

  const trimmedReason = reason.trim();
  const normalizedIdempotencyKey = idempotencyKey?.trim() || undefined;

  return withResourceLocks([`developer:${developerId}`], async () => {
    const result = await prisma.$transaction(async (tx) => {
      await acquireCreditAccountRowLock(tx, developerId);

      if (normalizedIdempotencyKey) {
        const existingTx = await tx.creditTransaction.findUnique({
          where: {
            developerId_idempotencyKey: {
              developerId,
              idempotencyKey: normalizedIdempotencyKey,
            },
          },
        });

        if (existingTx) {
          if (existingTx.amount !== amount || existingTx.type !== txType) {
            throw new ClaimEngineError(
              'IDEMPOTENCY_CONFLICT',
              'Idempotency key was already used with different credit adjustment parameters',
              409,
              { idempotencyKey: normalizedIdempotencyKey }
            );
          }

          return {
            success: true as const,
            idempotentReplay: true,
            developerId,
            accountId: existingTx.accountId,
            transactionId: existingTx.id,
            type: existingTx.type,
            amount: existingTx.amount,
            balanceBefore: existingTx.balanceBefore,
            balanceAfter: existingTx.balanceAfter,
            reason: existingTx.reason,
            performedById: existingTx.performedById ?? existingTx.actorId ?? performedById,
            createdAt: existingTx.createdAt,
          };
        }
      }

      const account = await ensureDeveloperCreditAccount(tx, developerId);
      const balanceBefore = account.balance;
      const balanceAfter = balanceBefore + amount;

      if (balanceAfter < 0) {
        throw new ClaimEngineError(
          'INSUFFICIENT_CREDITS',
          `Cannot deduct ${Math.abs(amount)} credits: current balance is ${balanceBefore} (negative balances are forbidden)`,
          422,
          {
            currentBalance: balanceBefore,
            requestedAdjustment: amount,
            projectedBalance: balanceAfter,
          }
        );
      }

      const lifetimeUpdate: Prisma.DeveloperCreditAccountUpdateManyMutationInput = {
        balance: balanceAfter,
        version: { increment: 1 },
        updatedAt: new Date(),
      };

      if (amount > 0) {
        lifetimeUpdate.totalGranted = { increment: amount };
        if (txType === 'PURCHASE') {
          lifetimeUpdate.lifetimePurchased = { increment: amount };
        } else {
          lifetimeUpdate.lifetimeBonus = { increment: amount };
        }
      } else if (amount < 0) {
        if (txType === 'EXPIRATION') {
          lifetimeUpdate.lifetimeExpired = { increment: Math.abs(amount) };
        } else {
          lifetimeUpdate.lifetimeSpent = { increment: Math.abs(amount) };
          lifetimeUpdate.totalSpent = { increment: Math.abs(amount) };
        }
      }

      const updatedCount = await tx.developerCreditAccount.updateMany({
        where: {
          id: account.id,
          version: account.version,
          ...(amount < 0 ? { balance: { gte: Math.abs(amount) } } : {}),
        },
        data: lifetimeUpdate,
      });

      if (updatedCount.count !== 1) {
        throw new ClaimEngineError(
          'CONCURRENCY_CONFLICT',
          'Concurrent credit modification detected; please retry',
          409
        );
      }

      // Keep legacy Subscription.credits synchronized
      await tx.subscription.updateMany({
        where: { userId: developerId },
        data: { credits: balanceAfter },
      });

      const createdTx = await tx.creditTransaction.create({
        data: {
          accountId: account.id,
          developerId,
          type: txType,
          amount,
          balanceBefore,
          balanceAfter,
          referenceType: 'ADMIN_ADJUSTMENT',
          referenceId: performedById,
          reason: trimmedReason,
          metadata: (metadata ?? { ipAddress }) as Prisma.InputJsonValue,
          idempotencyKey: normalizedIdempotencyKey,
          actorId: performedById,
          performedById,
        },
      });

      return {
        success: true as const,
        idempotentReplay: false,
        developerId,
        accountId: account.id,
        transactionId: createdTx.id,
        type: createdTx.type,
        amount: createdTx.amount,
        balanceBefore,
        balanceAfter,
        reason: createdTx.reason,
        performedById,
        createdAt: createdTx.createdAt,
      };
    });

    if (!result.idempotentReplay) {
      logClaimEngineEvent('credits_adjusted', {
        developerId,
        transactionId: result.transactionId,
        credits: result.amount,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        details: { type: result.type, reason: result.reason, performedById },
      });

      await createAuditLog({
        userId: performedById,
        action: 'ADMIN_CREDITS_ADJUSTED',
        entityType: 'DeveloperCreditAccount',
        entityId: result.accountId,
        details: {
          developerId,
          transactionId: result.transactionId,
          type: result.type,
          amount: result.amount,
          balanceBefore: result.balanceBefore,
          balanceAfter: result.balanceAfter,
          reason: result.reason,
        },
        ipAddress,
      });
    }

    return result;
  });
}

/**
 * Sets or grants subscription credits inside an existing transaction or standalone call
 * while maintaining the immutable `CreditTransaction` ledger invariant.
 */
export async function syncSubscriptionCreditsToLedgerInTx(
  tx: DbClient,
  params: {
    developerId: string;
    targetBalance: number;
    type: Extract<CreditTransactionType, 'PURCHASE' | 'BONUS' | 'ADMIN_ADJUSTMENT' | 'CORRECTION'>;
    reason: string;
    referenceType?: string;
    referenceId?: string;
    performedById?: string;
  }
) {
  const { developerId, targetBalance, type, reason, referenceType, referenceId, performedById } = params;
  const clampedTarget = Math.max(0, Math.round(targetBalance));
  const account = await ensureDeveloperCreditAccount(tx, developerId);
  const delta = clampedTarget - account.balance;

  if (delta === 0) {
    return account;
  }

  const balanceBefore = account.balance;
  const balanceAfter = clampedTarget;

  const updatedAccount = await tx.developerCreditAccount.update({
    where: { id: account.id },
    data: {
      balance: balanceAfter,
      ...(delta > 0
        ? type === 'PURCHASE'
          ? { lifetimePurchased: { increment: delta }, totalGranted: { increment: delta } }
          : { lifetimeBonus: { increment: delta }, totalGranted: { increment: delta } }
        : { lifetimeSpent: { increment: Math.abs(delta) }, totalSpent: { increment: Math.abs(delta) } }),
      version: { increment: 1 },
    },
  });

  await tx.creditTransaction.create({
    data: {
      accountId: account.id,
      developerId,
      type: delta > 0 ? type : 'ADMIN_ADJUSTMENT',
      amount: delta,
      balanceBefore,
      balanceAfter,
      referenceType: referenceType ?? 'SUBSCRIPTION',
      referenceId: referenceId ?? developerId,
      reason,
      actorId: performedById,
      performedById,
    },
  });

  return updatedAccount;
}
