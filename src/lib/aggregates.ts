import { prisma } from '@/lib/db';

export interface PageAggregates {
  totalCount: number;
  noWebsiteCount: number;
  highReviewsCount: number;
  topAreas: string[];
}

export async function getProgrammaticPageAggregates(
  cityDbValues: string[],
  categoryDbValues: string[]
): Promise<PageAggregates> {
  const where = {
    isMock: false,
    isCanonical: true,
    status: 'AVAILABLE' as const,
    city: { in: cityDbValues },
    category: { in: categoryDbValues },
  };

  const [totalCount, noWebsiteCount, highReviewsCount, leadsWithArea] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.count({
      where: {
        ...where,
        OR: [
          { websiteStatus: 'NO_WEBSITE' },
          { website: null },
          { website: '' },
        ],
      },
    }),
    prisma.lead.count({
      where: {
        ...where,
        reviewCount: { gte: 50 },
      },
    }),
    prisma.lead.findMany({
      where: {
        ...where,
        area: { not: null },
      },
      select: { area: true },
      take: 200,
    }),
  ]);

  // Aggregate top areas
  const areaCounts: Record<string, number> = {};
  for (const l of leadsWithArea) {
    if (l.area) {
      const trimmed = l.area.trim();
      if (trimmed) {
        areaCounts[trimmed] = (areaCounts[trimmed] || 0) + 1;
      }
    }
  }

  const topAreas = Object.entries(areaCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area]) => area);

  return {
    totalCount,
    noWebsiteCount,
    highReviewsCount,
    topAreas,
  };
}

export function generateUniqueIntro({
  cityName,
  catName,
  aggregates,
  isAr,
}: {
  cityName: string;
  catName: string;
  aggregates: PageAggregates;
  isAr: boolean;
}): string {
  const { totalCount, noWebsiteCount, highReviewsCount, topAreas } = aggregates;

  if (isAr) {
    let text = `يضم قطاع ${catName} في ${cityName} حالياً ${totalCount} فرصة لنشاط تجاري مؤهل تم فحصها وفق قواعد تقييم واضحة. `;

    if (noWebsiteCount > 0) {
      text += `من بينها ${noWebsiteCount} نشاطاً يعمل بدون موقع إلكتروني بالكامل ويمثل فرصة مباشرة لتطوير موقع جديد. `;
    }

    if (topAreas.length > 0) {
      text += `وتتركز أبرز هذه الأنشطة جغرافياً في مناطق (${topAreas.join('، ')}). `;
    }

    if (highReviewsCount > 0) {
      text += `كما يمتلك ${highReviewsCount} نشاطاً منها تقييمات نشطة وتفاعلاً مستمراً على خرائط جوجل يعكس قدرتهم التشغيلية واستعدادهم للاستثمار الرقمي.`;
    }

    return text.trim();
  } else {
    let text = `The ${catName} sector in ${cityName} currently features ${totalCount} qualified business opportunities evaluated through transparent qualification rules. `;

    if (noWebsiteCount > 0) {
      text += `Among them, ${noWebsiteCount} businesses operate completely without a website, offering prime prospects for modern web development. `;
    }

    if (topAreas.length > 0) {
      text += `Key concentrations are situated across ${topAreas.join(', ')}. `;
    }

    if (highReviewsCount > 0) {
      text += `Additionally, ${highReviewsCount} establishments have active customer engagement with 50+ reviews on Google Maps, indicating established local demand and operational scale.`;
    }

    return text.trim();
  }
}
