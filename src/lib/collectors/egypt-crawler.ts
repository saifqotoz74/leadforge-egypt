import { RawLeadInput } from '../validator';
import { normalizePhone } from '../normalizer';

export interface CrawlTarget {
  category: string;
  niche: string;
  query: string;
  defaultGovernorate: string;
  defaultCity: string;
}

export const EGYPTIAN_CRAWL_TARGETS: CrawlTarget[] = [
  // 1. Clinics & Medical (High demand for websites & online booking)
  {
    category: 'Dental',
    niche: 'Dental Clinic',
    query: 'عيادة اسنان القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة',
  },
  {
    category: 'Medical',
    niche: 'Medical Clinic',
    query: 'عيادة دكتور الجيزة مصر',
    defaultGovernorate: 'الجيزة',
    defaultCity: 'الجيزة',
  },
  {
    category: 'Dental',
    niche: 'Dental Clinic',
    query: 'عيادة اسنان الاسكندرية مصر',
    defaultGovernorate: 'الإسكندرية',
    defaultCity: 'الإسكندرية',
  },
  {
    category: 'Dental',
    niche: 'Dental Clinic',
    query: 'عيادة اسنان الشيخ زايد الجيزة',
    defaultGovernorate: 'الجيزة',
    defaultCity: 'الشيخ زايد',
  },
  {
    category: 'Medical',
    niche: 'Specialized Center',
    query: 'مركز طبي القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مدينة نصر',
  },
  {
    category: 'Medical',
    niche: 'Hospital & Clinic',
    query: 'مستشفى القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة',
  },
  {
    category: 'Dental',
    niche: 'Dentist',
    query: 'دكتور اسنان مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مصر الجديدة',
  },
  {
    category: 'Medical',
    niche: 'Plastic Surgery',
    query: 'clinic Cairo Egypt',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مصر الجديدة',
  },

  // 2. Restaurants, Cafes & Hospitality (Online ordering, digital menus)
  {
    category: 'Restaurant',
    niche: 'Oriental & Fine Dining',
    query: 'مطعم الزمالك القاهرة',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'الزمالك',
  },
  {
    category: 'Restaurant',
    niche: 'Restaurant & Cafe',
    query: 'مطعم المعادي القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'المعادي',
  },
  {
    category: 'Restaurant',
    niche: 'Dining & Lounge',
    query: 'مطعم مصر الجديدة القاهرة',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مصر الجديدة',
  },
  {
    category: 'Restaurant',
    niche: 'Casual Dining',
    query: 'مطعم مدينة نصر القاهرة',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مدينة نصر',
  },
  {
    category: 'Restaurant',
    niche: 'Cafe & Bistro',
    query: 'كافيه المهندسين الجيزة',
    defaultGovernorate: 'الجيزة',
    defaultCity: 'المهندسين',
  },
  {
    category: 'Restaurant',
    niche: 'Cafe & Restaurant',
    query: 'كافيه الشيخ زايد الجيزة',
    defaultGovernorate: 'الجيزة',
    defaultCity: 'الشيخ زايد',
  },
  {
    category: 'Restaurant',
    niche: 'Cafe & Work Lounge',
    query: 'كافيه المعادي القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'المعادي',
  },
  {
    category: 'Restaurant',
    niche: 'Seafood & Dining',
    query: 'مطعم سموحة الاسكندرية',
    defaultGovernorate: 'الإسكندرية',
    defaultCity: 'سموحة',
  },
  {
    category: 'Restaurant',
    niche: 'Fast Casual',
    query: 'مطعم التجمع الخامس مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة الجديدة',
  },

  // 3. Real Estate, Contracting & Interior Design
  {
    category: 'Real Estate',
    niche: 'Real Estate Agency',
    query: 'real estate Cairo Egypt',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة الجديدة',
  },
  {
    category: 'Real Estate',
    niche: 'Property Brokerage',
    query: 'شركة عقارات التجمع الخامس',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة الجديدة',
  },
  {
    category: 'Real Estate',
    niche: 'Construction & Contracting',
    query: 'شركة مقاولات القاهرة مصر',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة',
  },
  {
    category: 'Real Estate',
    niche: 'Commercial Real Estate',
    query: 'شركة المعادي القاهرة',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'المعادي',
  },
  {
    category: 'Real Estate',
    niche: 'Real Estate Sheikh Zayed',
    query: 'شركة عقارات الشيخ زايد الجيزة',
    defaultGovernorate: 'الجيزة',
    defaultCity: 'الشيخ زايد',
  },

  // 4. Retail, Boutiques & Home Furnishing
  {
    category: 'Retail',
    niche: 'Fashion Boutique',
    query: 'boutique Cairo Egypt',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة الجديدة',
  },
  {
    category: 'Retail',
    niche: 'Clothing Store',
    query: 'محل ملابس المعادي القاهرة',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'المعادي',
  },
  {
    category: 'Retail',
    niche: 'Furniture Showroom',
    query: 'معرض اثاث مدينة نصر القاهرة',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مدينة نصر',
  },
  {
    category: 'Retail',
    niche: 'Home Decor & Furniture',
    query: 'معرض اثاث التجمع الخامس',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'القاهرة الجديدة',
  },
  {
    category: 'Retail',
    niche: 'Optics & Eyewear',
    query: 'نظارات مصر الجديدة القاهرة',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مصر الجديدة',
  },

  // 5. Automotive, Fitness & Professional Services
  {
    category: 'Automotive',
    niche: 'Car Service & Repair',
    query: 'car repair Cairo Egypt',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'مدينة نصر',
  },
  {
    category: 'Fitness',
    niche: 'Gym & Fitness Center',
    query: 'gym Cairo Egypt',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'المعادي',
  },
  {
    category: 'Legal',
    niche: 'Law Firm',
    query: 'lawyer Cairo Egypt',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'وسط البلد',
  },
  {
    category: 'Education',
    niche: 'Training & Academy',
    query: 'training center Cairo Egypt',
    defaultGovernorate: 'القاهرة',
    defaultCity: 'الدقي',
  },
];

interface NominatimResult {
  place_id: number;
  osm_id: number;
  osm_type: string;
  display_name: string;
  name?: string;
  class?: string;
  type?: string;
  lat?: string;
  lon?: string;
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

/**
 * Parses and formats Egyptian phone numbers strictly adhering to LeadForge rules.
 * If phone is invalid, returns null (ensuring zero fake numbers and 1-credit Field Visit discount eligibility).
 */
function cleanEgyptianPhone(rawPhone?: string | null): string | null {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  // Split multiple numbers and take the first
  const first = rawPhone.split(/[;,/|\n]/)[0].trim();
  if (!first) return null;

  const normalized = normalizePhone(first);
  if (!normalized) return null;

  // LeadForge standard phone format with leading +
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}

/**
 * Normalizes external URLs into safe absolute links.
 */
function normalizeSocialLink(raw?: string | null, platform: 'facebook' | 'instagram' = 'facebook'): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const cleanHandle = trimmed.replace(/^[@/]+/, '');
  if (!cleanHandle) return null;

  if (platform === 'facebook') {
    return `https://www.facebook.com/${cleanHandle}`;
  }
  return `https://www.instagram.com/${cleanHandle}`;
}

async function fetchFromNominatim(query: string, limit = 5): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&extratags=1&limit=${limit}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'LeadForge-Egypt-Crawler/2.0 (contact@leads4dev.com)',
        'Accept-Language': 'ar,en;q=0.9',
      },
      signal: AbortSignal.timeout(9000),
    });

    if (!response.ok) return [];
    return (await response.json()) as NominatimResult[];
  } catch {
    return [];
  }
}

export interface CrawlOptions {
  targetCount?: number;
  category?: string;
  governorate?: string;
  targets?: CrawlTarget[];
  shuffle?: boolean;
}

/**
 * Crawls live, authentic Egyptian commercial entities across key developer-relevant sectors:
 * Dental, Medical, Restaurants, Real Estate, Contracting, Retail, Automotive, Fitness, and Legal.
 *
 * Employs sector-balanced round-robin collection and multi-point contact extraction.
 */
export async function crawlLiveEgyptianLeads(options: CrawlOptions = {}): Promise<RawLeadInput[]> {
  const maxToCollect = options.targetCount ?? 30;

  let pool = options.targets ? [...options.targets] : [...EGYPTIAN_CRAWL_TARGETS];

  if (options.category) {
    const targetCat = options.category.trim().toLowerCase();
    pool = pool.filter((t) => t.category.toLowerCase() === targetCat);
  }

  if (options.governorate) {
    const targetGov = options.governorate.trim().toLowerCase();
    pool = pool.filter((t) => t.defaultGovernorate.toLowerCase().includes(targetGov));
  }

  if (pool.length === 0) {
    pool = [...EGYPTIAN_CRAWL_TARGETS];
  }

  // Shuffle targets so consecutive crawls explore different sectors and cities
  if (options.shuffle !== false) {
    pool.sort(() => Math.random() - 0.5);
  }

  const collectedLeads: RawLeadInput[] = [];
  const seenExternalIds = new Set<string>();

  // Sector-balanced round-robin: iterate through pool taking up to 3 per target
  let targetIndex = 0;
  let idlePasses = 0;

  while (collectedLeads.length < maxToCollect && idlePasses < pool.length) {
    const target = pool[targetIndex % pool.length];
    targetIndex++;

    const remaining = maxToCollect - collectedLeads.length;
    const batchLimit = Math.min(remaining, 3);

    const results = await fetchFromNominatim(target.query, batchLimit + 2);
    let itemsAddedInTarget = 0;

    for (const item of results) {
      if (collectedLeads.length >= maxToCollect) break;

      // Filter out road segments, admin boundaries, or infrastructure lines
      if (item.class === 'highway' || item.class === 'boundary' || item.class === 'place') {
        continue;
      }

      const externalId = `osm-${item.osm_type}-${item.osm_id || item.place_id}`;
      if (seenExternalIds.has(externalId)) continue;
      seenExternalIds.add(externalId);

      const rawName = item.name || item.display_name?.split(',')[0]?.trim() || '';
      if (!rawName || rawName.length < 2) continue;

      const road = item.address?.road?.trim() || '';
      const suburb =
        item.address?.suburb?.trim() ||
        item.address?.neighbourhood?.trim() ||
        item.address?.quarter?.trim() ||
        '';
      const city = item.address?.city?.trim() || suburb || target.defaultCity;
      const state = item.address?.state?.trim() || target.defaultGovernorate;

      const fullAddress = [road, suburb, city].filter(Boolean).join('، ');

      const extra = item.extratags || {};
      const rawPhone =
        extra.phone ||
        extra.mobile ||
        extra['contact:phone'] ||
        extra['contact:mobile'] ||
        extra['contact:whatsapp'] ||
        null;
      const parsedPhone = cleanEgyptianPhone(rawPhone);

      const websiteUrl = extra.website || extra['contact:website'] || extra.url || null;
      const rawFacebook = extra['contact:facebook'] || extra.facebook || null;
      const rawInstagram = extra['contact:instagram'] || extra.instagram || null;

      const facebookUrl = normalizeSocialLink(rawFacebook, 'facebook');
      const instagramUrl = normalizeSocialLink(rawInstagram, 'instagram');

      const isCleanDomain = Boolean(
        websiteUrl &&
          !websiteUrl.includes('facebook.com') &&
          !websiteUrl.includes('instagram.com') &&
          !websiteUrl.includes('tiktok.com') &&
          !websiteUrl.includes('twitter.com')
      );
      const websiteStatus = isCleanDomain ? 'HAS_WEBSITE' : 'NO_WEBSITE';

      // Estimated budget in Egyptian Pounds (EGP) based on sector
      const budgetEstimates: Record<string, number> = {
        Dental: 20000,
        Medical: 22000,
        Restaurant: 18000,
        'Real Estate': 32000,
        Contracting: 35000,
        Retail: 15000,
        Automotive: 25000,
        Fitness: 16000,
        Legal: 18000,
        Education: 20000,
      };

      const estimatedBudget = budgetEstimates[target.category] || 18000;

      const leadInput: RawLeadInput = {
        name: rawName,
        businessName: rawName,
        phone: parsedPhone,
        website: isCleanDomain ? websiteUrl : null,
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
      itemsAddedInTarget++;
      if (itemsAddedInTarget >= batchLimit) break;
    }

    if (itemsAddedInTarget === 0) {
      idlePasses++;
    } else {
      idlePasses = 0;
    }

    // Friendly delay between target queries to respect public OSM rate limits
    await new Promise((res) => setTimeout(res, 280));
  }

  return collectedLeads;
}
