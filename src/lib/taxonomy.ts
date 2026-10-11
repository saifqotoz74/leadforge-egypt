/**
 * Bilingual taxonomy lookup helpers for categories and geographical locations
 */

// Mapping of known city names (both English and Arabic) to geo keys
export const CITY_TO_GEO_KEY: Record<string, string> = {
  'القاهرة': 'cairo',
  'Cairo': 'cairo',
  'الجيزة': 'giza',
  'Giza': 'giza',
  'الإسكندرية': 'alexandria',
  'Alexandria': 'alexandria',
  'الدقهلية': 'dakahlia',
  'Dakahlia': 'dakahlia',
  'الغربية': 'gharbia',
  'Gharbia': 'gharbia',
  'الشرقية': 'sharqia',
  'Sharqia': 'sharqia',
  'القليوبية': 'qalyubia',
  'Qalyubia': 'qalyubia',
  'أسيوط': 'asyut',
  'Asyut': 'asyut',
  'البحر الأحمر': 'redSea',
  'Red Sea': 'redSea',
  'بورسعيد': 'portSaid',
  'Port Said': 'portSaid',
  'السويس': 'suez',
  'Suez': 'suez',
  'الفيوم': 'fayoum',
  'Fayoum': 'fayoum',
  'بني سويف': 'beniSuef',
  'Beni Suef': 'beniSuef',
  'المنيا': 'minya',
  'Minya': 'minya',
  'سوهاج': 'sohag',
  'Sohag': 'sohag',
  'قنا': 'qena',
  'Qena': 'qena',
  'الأقصر': 'luxor',
  'Luxor': 'luxor',
  'أسوان': 'aswan',
  'Aswan': 'aswan',
  'القاهرة الجديدة': 'newCairo',
  'New Cairo': 'newCairo',
  'مدينة نصر': 'nasrCity',
  'Nasr City': 'nasrCity',
  'مصر الجديدة': 'heliopolis',
  'Heliopolis': 'heliopolis',
  'المعادي': 'maadi',
  'Maadi': 'maadi',
  'التجمع الخامس': 'tagamoa',
  '5th Settlement': 'tagamoa',
  'الزمالك': 'zamalek',
  'Zamalek': 'zamalek',
  'وسط البلد': 'downtown',
  'Downtown': 'downtown',
  'شبرا': 'shobra',
  'Shubra': 'shobra',
  'المقطم': 'mokattam',
  'Mokattam': 'mokattam',
  'الشروق': 'shorouk',
  'El Shorouk': 'shorouk',
  'الرحاب': 'rehab',
  'El Rehab': 'rehab',
  'مدينتي': 'madinaty',
  'Madinaty': 'madinaty',
  'حلوان': 'helwan',
  'Helwan': 'helwan',
  'الشيخ زايد': 'sheikhZayed',
  'Sheikh Zayed': 'sheikhZayed',
  '6 أكتوبر': 'october6',
  '6th of October': 'october6',
  'المنصورة': 'mansoura',
  'Mansoura': 'mansoura',
  'طنطا': 'tanta',
  'Tanta': 'tanta',
  'المحلة الكبرى': 'mahalla',
  'El Mahalla El Kubra': 'mahalla',
  'الزقازيق': 'zagazig',
  'Zagazig': 'zagazig',
  'العاشر من رمضان': 'tenthOfRamadan',
  '10th of Ramadan': 'tenthOfRamadan',
  'بنها': 'banha',
  'Banha': 'banha',
  'العبور': 'obour',
  'El Obour': 'obour',
  'الغردقة': 'hurghada',
  'Hurghada': 'hurghada',
  'التجمع الأول': 'tagamoa1',
  '1st Settlement': 'tagamoa1',
  'التجمع الثالث': 'tagamoa3',
  '3rd Settlement': 'tagamoa3',
  'حدائق حلوان': 'hadayekHelwan',
  'Hadayek Helwan': 'hadayekHelwan',
  '15 مايو': 'may15',
  '15th of May': 'may15',
  'الدقي': 'dokki',
  'Dokki': 'dokki',
  'المهندسين': 'mohandessin',
  'Mohandessin': 'mohandessin',
  'العجوزة': 'agouza',
  'Agouza': 'agouza',
  'الهرم': 'haram',
  'Haram': 'haram',
  'فيصل': 'faisal',
  'Faisal': 'faisal',
  'حدائق الأهرام': 'hadayekAhram',
  'Hadayek El Ahram': 'hadayekAhram',
  'الحي الأول': 'district1',
  '1st District': 'district1',
  'الحي الثاني': 'district2',
  '2nd District': 'district2',
  'الحي الرابع': 'district4',
  '4th District': 'district4',
  'الحي السابع': 'district7',
  '7th District': 'district7',
  'الحي التاسع': 'district9',
  '9th District': 'district9',
  'بيفرلي هيلز': 'beverlyHills',
  'Beverly Hills': 'beverlyHills',
  'أركان': 'arkan',
  'Arkan': 'arkan',
  'الحصري': 'hosary',
  'El Hosary': 'hosary',
  'الحي المتميز': 'motamayez',
  'Distinguished District': 'motamayez',
  'سموحة': 'smouha',
  'Smouha': 'smouha',
  'سيدي جابر': 'sidiGaber',
  'Sidi Gaber': 'sidiGaber',
  'رشدي': 'roshdy',
  'Roshdy': 'roshdy',
  'ستانلي': 'stanley',
  'Stanley': 'stanley',
  'لوران': 'lauran',
  'Louran': 'lauran',
  'ميامي': 'miami',
  'Miami': 'miami',
  'المنتزه': 'montaza',
  'El Montaza': 'montaza',
  'محطة الرمل': 'ramlStation',
  'Raml Station': 'ramlStation',
  'برج العرب': 'borgElArab',
  'Borg El Arab': 'borgElArab',
  'حي الجامعة': 'universityDistrict',
  'University District': 'universityDistrict',
  'المشاية السفلية': 'mashaya',
  'El Mashaya': 'mashaya',
  'توريل': 'toreel',
  'Toreel': 'toreel',
  'طلخا': 'talkha',
  'Talkha': 'talkha',
  'شارع الجمهورية': 'gomhoriaSt',
  'El Gomhoria St': 'gomhoriaSt',
  'شارع البحر': 'bahrSt',
  'El Bahr St': 'bahrSt',
  'النادي': 'elNady',
  'El Nady': 'elNady',
  'الاستاد': 'elEstad',
  'El Estad': 'elEstad',
  'شارع شكري القوتلي': 'shokryKowatlySt',
  'Shokry El Kowatly St': 'shokryKowatlySt',
  'السبع بنات': 'sabaaBanat',
  'El Sabaa Banat': 'sabaaBanat',
  'القومية': 'kawmia',
  'El Kawmia': 'kawmia',
  'فلل الجامعة': 'universityVillas',
  'University Villas': 'universityVillas',
  'شارع المحافظة': 'mohafzaSt',
  'El Mohafza St': 'mohafzaSt',
  'الأردنية': 'ordonia',
  'El Ordonia': 'ordonia',
  'المجاورة الأولى': 'megawra1',
  '1st Neighborhood': 'megawra1',
  'المنطقة الصناعية': 'industrialZone',
  'Industrial Zone': 'industrialZone',
  'الفلل': 'elVelal',
  'El Velal': 'elVelal',
  'كورنيش النيل': 'nileCorniche',
  'Nile Corniche': 'nileCorniche',
  'الأتريب': 'atrib',
  'Atrib': 'atrib',
  'جولف سيتي': 'golfCity',
  'Golf City': 'golfCity',
  'فريال': 'feryal',
  'Feryal': 'feryal',
  'الوليدية': 'walidia',
  'El Walidia': 'walidia',
  'الكوثر': 'kawther',
  'El Kawther': 'kawther',
  'الدهار': 'dahar',
  'El Dahar': 'dahar',
  'سقارة': 'saqqara',
  'Saqqara': 'saqqara',
  'الممشى السياحي': 'promenade',
  'Tourist Promenade': 'promenade',
  'الشرق': 'elSharq',
  'El Sharq': 'elSharq',
  'العرب': 'elArab',
  'El Arab': 'elArab',
  'الزهور': 'elZohour',
  'El Zohour': 'elZohour',
  'بورفؤاد': 'portFouad',
  'Port Fouad': 'portFouad',
};

// Mapping of known category values (English/Arabic) to standard category key
export const CATEGORY_NORM_MAP: Record<string, string> = {
  Dental: 'Dental',
  'عيادات الأسنان': 'Dental',
  Medical: 'Medical',
  'المراكز الطبية والعيادات': 'Medical',
  Restaurant: 'Restaurant',
  'المطاعم والكافيهات': 'Restaurant',
  'Real Estate': 'Real Estate',
  'العقارات والمقاولات': 'Real Estate',
  Education: 'Education',
  'التعليم والأكاديميات': 'Education',
  Retail: 'Retail',
  'التجارة والمحلات التجارية': 'Retail',
  Beauty: 'Beauty',
  'مراكز التجميل والعناية': 'Beauty',
  Automotive: 'Automotive',
  'السيارات وخدمات الصيانة': 'Automotive',
  Other: 'Other',
  'أنشطة تجارية أخرى': 'Other',
};

// Mapping of legacy or alternate website statuses
export const WEBSITE_STATUS_NORM_MAP: Record<string, string> = {
  NO_WEBSITE: 'NO_WEBSITE',
  POOR_WEBSITE: 'POOR_WEBSITE',
  NEEDS_REDESIGN: 'POOR_WEBSITE',
  HAS_WEBSITE: 'HAS_WEBSITE',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Localizes a city or governorate using the geo translation namespace
 */
export function localizeCity(city: string, tGeo: { has: (k: string) => boolean; (k: string): string }): string {
  if (!city) return '';
  const geoKey = CITY_TO_GEO_KEY[city];
  if (geoKey && tGeo.has(geoKey)) {
    return tGeo(geoKey);
  }
  return city;
}

/**
 * Localizes a bilingual qualification reason string formatted as "+20 Arabic reason (English reason)"
 * into a single-language string for the active locale.
 */
export function localizeQualificationReason(rawReason: string, locale: string): string {
  if (!rawReason) return '';
  const match = rawReason.match(/^([+-]?\d+)\s+(.+?)\s*\(([^()]+)\)\s*$/);
  if (match) {
    const [, sign, reasonAr, reasonEn] = match;
    return locale === 'en' ? `${sign} ${reasonEn.trim()}` : `${sign} ${reasonAr.trim()}`;
  }
  return rawReason;
}

/**
 * Localizes a category using the categories translation namespace
 */
export function localizeCategory(category: string, tCat: { has: (k: string) => boolean; (k: string): string }): string {
  if (!category) return '';
  const normKey = CATEGORY_NORM_MAP[category] || category;
  if (tCat.has(normKey)) {
    return tCat(normKey);
  }
  return category;
}

/**
 * Localizes a website status enum or alias using enums.WebsiteStatus
 */
export function localizeWebsiteStatus(status: string, tEnums: (k: string) => string): string {
  if (!status) return '';
  const normKey = WEBSITE_STATUS_NORM_MAP[status] || status;
  try {
    return tEnums(`WebsiteStatus.${normKey}`);
  } catch {
    return status;
  }
}

export const SERVICE_TO_KEY: Record<string, string> = {
  'Website Development': 'websiteDevelopment',
  'E-Commerce Development': 'ecommerceDevelopment',
  'Landing Pages': 'landingPages',
  'Website Redesign': 'websiteRedesign',
  'Booking & Clinic Systems': 'bookingSystems',
  'Custom Web Applications': 'customWebApps',
  WEBSITE_DEVELOPMENT: 'WEBSITE_DEVELOPMENT',
  WEBSITE_REDESIGN: 'WEBSITE_REDESIGN',
  ECOMMERCE: 'ECOMMERCE',
  LANDING_PAGE: 'LANDING_PAGE',
  BOOKING_SYSTEM: 'BOOKING_SYSTEM',
  CUSTOM_SOFTWARE: 'CUSTOM_SOFTWARE',
  SEO: 'SEO',
};

/**
 * Localizes a developer service label using the services translation namespace
 */
export function localizeService(
  service: string,
  tServices: { has: (k: string) => boolean; (k: string): string }
): string {
  if (!service) return '';
  const key = SERVICE_TO_KEY[service] || service;
  if (tServices.has(key)) {
    return tServices(key);
  }
  return service;
}


export const KNOWN_PLAN_CODES = ['free', 'starter', 'pro', 'business', 'enterprise'] as const;
export type KnownPlanCode = (typeof KNOWN_PLAN_CODES)[number];

/**
 * Resolves a stable plan code from slug, id, or legacy database name.
 */
export function resolvePlanCode(input?: {
  slug?: string | null;
  id?: string | null;
  name?: string | null;
  nameEn?: string | null;
}): KnownPlanCode | null {
  if (!input) return null;
  const candidates = [input.slug, input.id, input.nameEn, input.name]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase());

  for (const c of candidates) {
    if ((KNOWN_PLAN_CODES as readonly string[]).includes(c)) {
      return c as KnownPlanCode;
    }
  }

  const combined = candidates.join(' ');
  if (combined.includes('free') || combined.includes('المجانية')) return 'free';
  if (combined.includes('starter') || combined.includes('البداية') || combined.includes('المبتدئ')) return 'starter';
  if (combined.includes('pro') || combined.includes('الاحترافية') || combined.includes('المحترف')) return 'pro';
  if (combined.includes('business') || combined.includes('الشركات') || combined.includes('الأعمال')) return 'business';
  if (combined.includes('enterprise') || combined.includes('المؤسسات')) return 'enterprise';

  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[LeadForge i18n] Unknown plan code "${input.slug || input.id || input.name || 'unknown'}". Using neutral localized fallback.`
    );
  }
  return null;
}

export interface LocalizedPlanCatalog {
  code: KnownPlanCode | 'fallback';
  name: string;
  tagline: string;
  features: string[];
}

/**
 * Resolves localized plan name, tagline, and features from the active locale catalog (`plans` namespace).
 * Never exposes mixed-language database strings as customer-facing plan labels.
 */
export function localizePlanCatalog(
  plan: {
    slug?: string | null;
    id?: string | null;
    name?: string | null;
    nameEn?: string | null;
    monthlyCredits: number;
    allowsExclusive?: boolean;
  },
  tPlans: {
    has: (k: string) => boolean;
    (k: string, values?: Record<string, string | number>): string;
  },
  formattedCredits?: string
): LocalizedPlanCatalog {
  const code = resolvePlanCode(plan);
  const creditsVal = formattedCredits ?? String(plan.monthlyCredits);

  if (!code) {
    const fallbackFeatures = [
      tPlans('fallback.featureCredits', { credits: creditsVal }),
      plan.allowsExclusive
        ? tPlans('fallback.featureExclusive')
        : tPlans('fallback.featureSharedOnly'),
      tPlans('fallback.featurePipeline'),
    ];
    return {
      code: 'fallback',
      name: tPlans('fallback.name'),
      tagline: tPlans('fallback.tagline'),
      features: fallbackFeatures,
    };
  }

  const featureKeys = ['f1', 'f2', 'f3', 'f4', 'f5'] as const;
  const features: string[] = [];
  for (const fk of featureKeys) {
    const fullKey = `${code}.${fk}`;
    if (tPlans.has(fullKey)) {
      features.push(tPlans(fullKey, { credits: creditsVal }));
    }
  }

  return {
    code,
    name: tPlans(`${code}.name`),
    tagline: tPlans.has(`${code}.tagline`) ? tPlans(`${code}.tagline`) : tPlans(`${code}.description`),
    features,
  };
}

/**
 * Localizes only the plan name from a plan object or raw name/slug string.
 */
export function localizePlanName(
  planOrSlug:
    | { slug?: string | null; id?: string | null; name?: string | null; nameEn?: string | null }
    | string
    | null
    | undefined,
  tPlansOrName:
    | { has: (k: string) => boolean; (k: string): string }
    | string
    | null
    | undefined,
  maybeTPlans?: { has: (k: string) => boolean; (k: string): string }
): string {
  const tPlans = maybeTPlans ?? (typeof tPlansOrName === 'function' ? tPlansOrName : null);
  if (!tPlans) return typeof tPlansOrName === 'string' ? tPlansOrName : '';
  if (!planOrSlug && typeof tPlansOrName !== 'string') return tPlans('fallback.name');
  const input =
    typeof planOrSlug === 'string'
      ? {
          slug: planOrSlug,
          name: typeof tPlansOrName === 'string' ? tPlansOrName : planOrSlug,
        }
      : planOrSlug || { name: typeof tPlansOrName === 'string' ? tPlansOrName : undefined };
  const code = resolvePlanCode(input);
  if (code && tPlans.has(`${code}.name`)) {
    return tPlans(`${code}.name`);
  }
  return tPlans('fallback.name');
}


