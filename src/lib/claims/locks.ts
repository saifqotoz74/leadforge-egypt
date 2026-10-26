import { Prisma } from '@prisma/client';

const keyQueues = new Map<string, Promise<void>>();

async function acquireSingleLock(key: string): Promise<() => void> {
  const prev = keyQueues.get(key) ?? Promise.resolve();
  let releaseFn!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });

  const chain = prev.then(() => current);
  keyQueues.set(key, chain);

  await prev;

  return () => {
    releaseFn();
    if (keyQueues.get(key) === chain) {
      keyQueues.delete(key);
    }
  };
}

/**
 * Acquires deterministic ordered locks on a set of resource keys (e.g. developer ID, lead ID, and global db tx queue)
 * to prevent race conditions and PGlite single-connection interleaved transaction collisions.
 */
export async function withResourceLocks<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
  if (process.env.DISABLE_RESOURCE_LOCKS === 'true') {
    return await fn();
  }
  const uniqueSortedKeys = Array.from(new Set(['__pglite_tx__', ...keys])).sort();
  const releases: Array<() => void> = [];

  try {
    for (const key of uniqueSortedKeys) {
      const release = await acquireSingleLock(key);
      releases.push(release);
    }
    return await fn();
  } finally {
    for (let i = releases.length - 1; i >= 0; i--) {
      releases[i]();
    }
  }
}

/**
 * Acquires a PostgreSQL row-level `FOR UPDATE` lock on the target `Lead` row inside a transaction.
 */
export async function acquireLeadRowLock(
  tx: Prisma.TransactionClient,
  leadId: string
): Promise<Array<{ id: string }>> {
  return tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "Lead" WHERE "id" = $1 FOR UPDATE',
    leadId
  );
}

/**
 * Acquires a PostgreSQL row-level `FOR UPDATE` lock on the target developer (`User` + `DeveloperCreditAccount`) inside a transaction.
 */
export async function acquireCreditAccountRowLock(
  tx: Prisma.TransactionClient,
  developerId: string
): Promise<Array<{ id: string }>> {
  await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE',
    developerId
  );
  return tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "DeveloperCreditAccount" WHERE "developerId" = $1 FOR UPDATE',
    developerId
  );
}

/**
 * Acquires PostgreSQL `FOR UPDATE` row locks in deterministic order (`Lead` then `DeveloperCreditAccount`)
 * to prevent deadlocks across concurrent claim/refund operations.
 */
export async function acquireLeadAndAccountRowLocks(
  tx: Prisma.TransactionClient,
  leadId: string,
  developerId: string
): Promise<void> {
  await acquireLeadRowLock(tx, leadId);
  await acquireCreditAccountRowLock(tx, developerId);
}

