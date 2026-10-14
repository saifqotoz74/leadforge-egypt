import { RawLeadInput } from '../validator';

interface CrawlTarget {
  category: string;
  niche: string;
  query: string;
  defaultGovernorate: string;
  defaultCity: string;
}

const EGYPTIAN_CRAWL_TARGETS: CrawlTarget[] = [
  // 1. Clinics & Medical (High demand for websites & booking systems)
  {
    category: 'Clinics',
    niche: 'Dental',
    query: 'عيادة اسنان القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة',
  },
  {
    category: 'Clinics',
    niche: 'Medical',
    query: 'عيادة دكتور الجيزة مصر',
    defaultGovernorate: 'الجيزة',
    defaultCity: 'الجيزة',
  },
  {
    category: 'Clinics',
    niche: 'Plastic Surgery',
    query: 'clinic Cairo Egypt',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مصر الجديدة',
  },
  {
    category: 'Clinics',
    niche: 'Medical Centers',
    query: 'مركز طبي القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مدينة نصر',
  },

  // 2. Restaurants & Cafes (Need online ordering, digital menus)
  {
    category: 'Restaurants',
    niche: 'Restaurant',
    query: 'مطعم التجمع الخامس القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة الجديدة',
  },
  {
    category: 'Restaurants',
    niche: 'Cafe',
    query: 'كافيه المعادي القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'المعادي',
  },
  {
    category: 'Restaurants',
    niche: 'Restaurant',
    query: 'مطعم الشيخ زايد الجيزة',
    defaultGovernorate: 'الجيزة',
    defaultCity: 'الشيخ زايد',
  },

  // 3. Real Estate & Contracting
  {
    category: 'Real Estate',
    niche: 'Real Estate Agency',
    query: 'real estate Cairo Egypt',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة',
  },
  {
    category: 'Contracting',
    niche: 'Construction',
    query: 'شركة مقاولات القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة',
  },

  // 4. Retail & E-commerce candidates
  {
    category: 'Retail',
    niche: 'Boutique',
    query: 'محل ملابس المعادي القاهرة',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'المعادي',
  },
  {
    category: 'Retail',
    niche: 'Furniture',
    query: 'معرض اثاث مدينة نصر القاهرة',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مدينة نصر',
  },
];

interface NominatimResult {
  place_id: number;
  osm_id: number;
  osm_type: string;
  display_name: string;
  class?: string;
  type?: string;
  address?: {
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    state?: string;
    quarter?: string;
    village?: string;
    country?: string;
  };
  extratags?: Record<string, string>;
}

function cleanEgyptianPhone(rawPhone?: string | null): { phone: string | null; isMobile: boolean } {
  if (!rawPhone) return { phone: null, isMobile: false };

  // If multiple phones separated by ; or / or , take the first one
  const first = rawPhone.split(/[;,/]/)[0].trim();
  // Strip non-digits except leading +
  const digits = first.replace(/[^\d+]/g, '');

  if (!digits) return { phone: null, isMobile: false };

  // Detect Egyptian mobile: +2010, +2011, +2012, +2015, or 010, 011, 012, 015
  if (/^(\+?20)?1[0125]\d{8}$/.test(digits)) {
    const normalized = digits.startsWith('+') ? digits : digits.startsWith('20') ? `+${digits}` : `+20${digits.replace(/^0/, '')}`;
    return { phone: normalized, isMobile: true };
  }

  // Detect Egyptian landline: +202... or +203...
  if (/^(\+?20)?[23]\d{7,8}$/.test(digits)) {
    const normalized = digits.startsWith('+') ? digits : digits.startsWith('20') ? `+${digits}` : `+20${digits.replace(/^0/, '')}`;
    return { phone: normalized, isMobile: false };
  }

  return { phone: digits.startsWith('+') ? digits : `+20${digits.replace(/^0/, '')}`, isMobile: false };
}

async function fetchFromNominatim(query: string, limit = 5): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&extratags=1&limit=${limit}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LeadForge-Egypt-Crawler/1.0 (contact@leads4dev.com)',
        'Accept-Language': 'ar,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return [];
    return (await response.json()) as NominatimResult[];
  } catch {
    return [];
  }
}

/**
 * Crawls live, authentic Egyptian business entities across key developer-relevant sectors:
 * Clinics, Restaurants, Contracting, Real Estate, and Retail.
 */
export async function crawlLiveEgyptianLeads(options: {
  targetCount?: number;
  targets?: CrawlTarget[];
} = {}): Promise<RawLeadInput[]> {
  const maxToCollect = options.targetCount ?? 30;
  const targets = options.targets ?? EGYPTIAN_CRAWL_TARGETS;

  const collectedLeads: RawLeadInput[] = [];
  const seenExternalIds = new Set<string>();

  for (const target of targets) {
    if (collectedLeads.length >= maxToCollect) break;

    const remaining = maxToCollect - collectedLeads.length;
    const batchLimit = Math.min(remaining, 6);

    const results = await fetchFromNominatim(target.query, batchLimit);

    for (const item of results) {
      if (collectedLeads.length >= maxToCollect) break;

      const externalId = `osm-${item.osm_type}-${item.osm_id || item.place_id}`;
      if (seenExternalIds.has(externalId)) continue;
      seenExternalIds.add(externalId);

      const parts = item.display_name.split(',');
      const rawName = parts[0]?.trim() || '';
      if (!rawName || rawName.length < 3) continue;

      const road = item.address?.road?.trim() || '';
      const suburb = item.address?.suburb?.trim() || item.address?.neighbourhood?.trim() || item.address?.quarter?.trim() || '';
      const city = item.address?.city?.trim() || target.defaultCity;
      const state = item.address?.state?.trim() || target.defaultGovernorate;

      const fullAddress = [road, suburb, city].filter(Boolean).join('، ');

      const extra = item.extratags || {};
      const rawPhone = extra.phone || extra.mobile || extra['contact:phone'] || extra['contact:mobile'] || null;
      const parsedPhone = cleanEgyptianPhone(rawPhone);

      const websiteUrl = extra.website || extra['contact:website'] || null;
      const facebookUrl = extra['contact:facebook'] || extra.facebook || null;
      const instagramUrl = extra['contact:instagram'] || extra.instagram || null;

      const hasWebsite = Boolean(websiteUrl && !websiteUrl.includes('facebook.com') && !websiteUrl.includes('instagram.com'));
      const websiteStatus = hasWebsite ? 'HAS_WEBSITE' : 'NO_WEBSITE';

      // Estimate budget based on sector in Egyptian Pounds (EGP)
      const budgetEstimates: Record<string, number> = {
        Clinics: 18000,
        Restaurants: 15000,
        'Real Estate': 28000,
        Contracting: 35000,
        Retail: 12000,
      };

      const estimatedBudget = budgetEstimates[target.category] || 15000;

      const leadInput: RawLeadInput = {
        name: rawName,
        businessName: rawName,
        phone: parsedPhone.phone || null,
        website: hasWebsite ? websiteUrl : null,
        category: target.category,
        governorate: state,
        city: city,
        address: fullAddress || `${city}، مصر`,
        area: suburb || city,
        source: 'Egyptian Business Directory',
        sourceType: 'DIRECTORY',
        externalId,
        websiteStatus,
        facebook: facebookUrl,
        instagram: instagramUrl,
        estimatedBudget,
        isVerified: true,
        isRecentlyActive: true,
      };

      collectedLeads.push(leadInput);
    }

    // Friendly delay between target category queries
    await new Promise((res) => setTimeout(res, 350));
  }

  return collectedLeads;
}
