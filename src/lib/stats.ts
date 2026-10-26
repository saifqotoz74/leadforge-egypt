import { prisma } from '@/lib/db';

export interface PlatformStats {
  businessesCount: number;
  citiesCount: number;
  categoriesCount: number;
  lastRefreshDate: string | null;
}

let cachedStats: { data: PlatformStats; expiresAt: number } | null = null;
const STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

export async function getCachedPlatformStats(): Promise<PlatformStats> {
  const now = Date.now();
  if (cachedStats && cachedStats.expiresAt > now) {
    return cachedStats.data;
  }

  try {
    const [businessesCount, citiesGroup, categoriesGroup, latestLead] = await Promise.all([
      prisma.lead.count({
        where: {
          isMock: false,
          isCanonical: true,
          status: { notIn: ['INVALID', 'DUPLICATE', 'NOT_SALEABLE', 'ARCHIVED'] },
        },
      }),
      prisma.lead.groupBy({
        by: ['city'],
        where: { isMock: false, isCanonical: true, city: { not: '' } },
      }),
      prisma.lead.groupBy({
        by: ['category'],
        where: { isMock: false, isCanonical: true, category: { not: '' } },
      }),
      prisma.lead.findFirst({
        where: { isMock: false, isCanonical: true },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true, lastVerifiedAt: true },
      }),
    ]);

    const lastDate = latestLead?.lastVerifiedAt || latestLead?.updatedAt;

    const data: PlatformStats = {
      businessesCount,
      citiesCount: citiesGroup.length,
      categoriesCount: categoriesGroup.length,
      lastRefreshDate: lastDate ? lastDate.toISOString() : null,
    };

    cachedStats = { data, expiresAt: now + STATS_CACHE_TTL_MS };
    return data;
  } catch (error) {
    console.error('Failed to compute platform stats:', error);
    return {
      businessesCount: 0,
      citiesCount: 0,
      categoriesCount: 0,
      lastRefreshDate: null,
    };
  }
}
