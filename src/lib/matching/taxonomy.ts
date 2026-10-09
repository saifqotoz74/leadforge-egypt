import { EGYPT_LOCATIONS } from '../constants';
import {
  CanonicalNicheCode,
  CanonicalProjectLeadType,
  CanonicalServiceCode,
  MatchableLeadInput,
} from './types';

const SERVICE_SYNONYMS: Record<string, CanonicalServiceCode> = {
  // WEBSITE_DEVELOPMENT
  website_development: 'WEBSITE_DEVELOPMENT',
  'website development': 'WEBSITE_DEVELOPMENT',
  web_development: 'WEBSITE_DEVELOPMENT',
  'web development': 'WEBSITE_DEVELOPMENT',
  new_website: 'WEBSITE_DEVELOPMENT',
  'new website': 'WEBSITE_DEVELOPMENT',
  corporate_website: 'WEBSITE_DEVELOPMENT',
  'تطوير مواقع الشركات والتعريفية': 'WEBSITE_DEVELOPMENT',
  'تطوير مواقع': 'WEBSITE_DEVELOPMENT',
  'إنشاء موقع جديد': 'WEBSITE_DEVELOPMENT',
  'موقع تعريفي': 'WEBSITE_DEVELOPMENT',

  // WEBSITE_REDESIGN
  website_redesign: 'WEBSITE_REDESIGN',
  'website redesign': 'WEBSITE_REDESIGN',
  redesign: 'WEBSITE_REDESIGN',
  'إعادة تصميم وتحديث المواقع القديمة': 'WEBSITE_REDESIGN',
  'إعادة تصميم المواقع': 'WEBSITE_REDESIGN',
  'تطوير وتحديث المواقع': 'WEBSITE_REDESIGN',
  'تحديث موقع': 'WEBSITE_REDESIGN',

  // ECOMMERCE
  ecommerce: 'ECOMMERCE',
  'e-commerce': 'ECOMMERCE',
  e_commerce: 'ECOMMERCE',
  'e-commerce development': 'ECOMMERCE',
  ecommerce_development: 'ECOMMERCE',
  online_store: 'ECOMMERCE',
  'تطوير المتاجر الإلكترونية': 'ECOMMERCE',
  'متاجر إلكترونية': 'ECOMMERCE',
  'متجر إلكتروني': 'ECOMMERCE',

  // LANDING_PAGE
  landing_page: 'LANDING_PAGE',
  landing_pages: 'LANDING_PAGE',
  'landing page': 'LANDING_PAGE',
  'landing pages': 'LANDING_PAGE',
  'صفحات الهبوط والحملات الإعلانية': 'LANDING_PAGE',
  'صفحات الهبوط': 'LANDING_PAGE',
  'صفحة هبوط': 'LANDING_PAGE',

  // BOOKING_SYSTEM
  booking_system: 'BOOKING_SYSTEM',
  'booking & clinic systems': 'BOOKING_SYSTEM',
  'booking systems': 'BOOKING_SYSTEM',
  clinic_system: 'BOOKING_SYSTEM',
  'مواقع الحجز للعيادات والمراكز الطبية': 'BOOKING_SYSTEM',
  'نظام حجز': 'BOOKING_SYSTEM',

  // CUSTOM_SOFTWARE
  custom_software: 'CUSTOM_SOFTWARE',
  'custom software': 'CUSTOM_SOFTWARE',
  custom_system: 'CUSTOM_SOFTWARE',
  'custom web applications': 'CUSTOM_SOFTWARE',
  custom_web_applications: 'CUSTOM_SOFTWARE',
  'تطبيقات الويب والأنظمة المخصصة': 'CUSTOM_SOFTWARE',
  'أنظمة مخصصة': 'CUSTOM_SOFTWARE',

  // WEB_APP
  web_app: 'WEB_APP',
  'web app': 'WEB_APP',
  'web application': 'WEB_APP',
  web_application: 'WEB_APP',
  'تطبيقات ويب': 'WEB_APP',

  // MOBILE_APP
  mobile_app: 'MOBILE_APP',
  'mobile app': 'MOBILE_APP',
  'mobile application': 'MOBILE_APP',
  mobile_application: 'MOBILE_APP',
  'تطبيقات الموبايل': 'MOBILE_APP',
  'تطبيق موبايل': 'MOBILE_APP',

  // SEO
  seo: 'SEO',
  'search engine optimization': 'SEO',
  'تحسين محركات البحث': 'SEO',

  // MAINTENANCE
  maintenance: 'MAINTENANCE',
  website_maintenance: 'MAINTENANCE',
  'website maintenance': 'MAINTENANCE',
  'صيانة المواقع': 'MAINTENANCE',
  'صيانة': 'MAINTENANCE',

  // UI_UX
  ui_ux: 'UI_UX',
  'ui/ux': 'UI_UX',
  'ui ux': 'UI_UX',
  'ui/ux design': 'UI_UX',
  'تصميم واجهات المستخدم': 'UI_UX',
};

export const SERVICE_LABELS: Record<string, { en: string; ar: string }> = {
  WEBSITE_DEVELOPMENT: {
    en: 'Website Development',
    ar: 'تطوير مواقع الشركات والتعريفية',
  },
  WEBSITE_REDESIGN: {
    en: 'Website Redesign',
    ar: 'إعادة تصميم وتحديث المواقع القديمة',
  },
  ECOMMERCE: {
    en: 'E-Commerce Development',
    ar: 'تطوير المتاجر الإلكترونية',
  },
  LANDING_PAGE: {
    en: 'Landing Pages',
    ar: 'صفحات الهبوط والحملات الإعلانية',
  },
  BOOKING_SYSTEM: {
    en: 'Booking & Clinic Systems',
    ar: 'مواقع الحجز للعيادات والمراكز الطبية',
  },
  CUSTOM_SOFTWARE: {
    en: 'Custom Software / Web Systems',
    ar: 'تطبيقات الويب والأنظمة المخصصة',
  },
  WEB_APP: {
    en: 'Web Application',
    ar: 'تطبيقات الويب',
  },
  MOBILE_APP: {
    en: 'Mobile App Development',
    ar: 'تطوير تطبيقات الموبايل',
  },
  SEO: {
    en: 'SEO Optimization',
    ar: 'تحسين محركات البحث (SEO)',
  },
  MAINTENANCE: {
    en: 'Website Maintenance',
    ar: 'صيانة وإدارة المواقع',
  },
  UI_UX: {
    en: 'UI/UX Design',
    ar: 'تصميم واجهات وتجربة المستخدم (UI/UX)',
  },
};

export function normalizeServiceCode(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (SERVICE_SYNONYMS[lower]) {
    return SERVICE_SYNONYMS[lower];
  }
  const snake = lower.replace(/[\s-]+/g, '_');
  if (SERVICE_SYNONYMS[snake]) {
    return SERVICE_SYNONYMS[snake];
  }
  if (lower.includes('redesign') || lower.includes('إعادة تصميم') || lower.includes('تحديث')) {
    return 'WEBSITE_REDESIGN';
  }
  if (
    lower.includes('ecommerce') ||
    lower.includes('e-commerce') ||
    lower.includes('متجر') ||
    lower.includes('متاجر')
  ) {
    return 'ECOMMERCE';
  }
  if (lower.includes('landing') || lower.includes('هبوط')) {
    return 'LANDING_PAGE';
  }
  if (lower.includes('booking') || lower.includes('حجز')) {
    return 'BOOKING_SYSTEM';
  }
  if (lower.includes('mobile') || lower.includes('موبايل')) {
    return 'MOBILE_APP';
  }
  if (lower.includes('seo') || lower.includes('محركات البحث')) {
    return 'SEO';
  }
  if (lower.includes('maintenance') || lower.includes('صيانة')) {
    return 'MAINTENANCE';
  }
  if (lower.includes('ui') || lower.includes('ux') || lower.includes('واجهات')) {
    return 'UI_UX';
  }
  if (lower.includes('web app') || lower.includes('web_app')) {
    return 'WEB_APP';
  }
  if (lower.includes('custom') || lower.includes('مخصص')) {
    return 'CUSTOM_SOFTWARE';
  }
  if (lower.includes('website') || lower.includes('موقع') || lower.includes('مواقع')) {
    return 'WEBSITE_DEVELOPMENT';
  }
  return trimmed.toUpperCase().replace(/[\s-]+/g, '_');
}

export function getServiceLabel(code: string): { en: string; ar: string } {
  const norm = normalizeServiceCode(code);
  return (
    SERVICE_LABELS[norm] || {
      en: code,
      ar: code,
    }
  );
}

/**
 * Resolves the required primary and secondary services for a Lead.
 * If `lead.requiredService` or `lead.requiredServices` are explicitly provided, uses them directly.
 * Otherwise, deterministically derives required services from `websiteStatus` and `category`.
 */
export function resolveLeadRequiredServices(lead: MatchableLeadInput): {
  primary: string;
  allRequired: string[];
  compatibleServices: string[];
  secondary: string[];
  isExplicit: boolean;
} {
  const explicitList = Array.isArray(lead.requiredServices)
    ? lead.requiredServices.map(normalizeServiceCode).filter(Boolean)
    : [];
  const explicitSingle = lead.requiredService ? normalizeServiceCode(lead.requiredService) : '';

  if (explicitList.length > 0 || explicitSingle) {
    const combined = Array.from(
      new Set([
        ...(explicitSingle ? [explicitSingle] : []),
        ...explicitList,
      ])
    );
    const primary = combined[0] || 'WEBSITE_DEVELOPMENT';
    const secondary = combined.slice(1);
    return {
      primary,
      allRequired: combined,
      compatibleServices: combined,
      secondary,
      isExplicit: true,
    };
  }

  // Deterministic derivation from websiteStatus & business category
  const webStatus = (lead.websiteStatus || 'NO_WEBSITE').toUpperCase();
  const niche = normalizeNicheCode(lead.niche || lead.category);

  if (webStatus === 'POOR_WEBSITE') {
    const secondary = ['WEBSITE_DEVELOPMENT', 'SEO', 'UI_UX', 'MAINTENANCE'];
    if (niche === 'DENTAL_CLINIC' || niche === 'MEDICAL') {
      secondary.push('BOOKING_SYSTEM');
    } else if (niche === 'RETAIL') {
      secondary.push('ECOMMERCE');
    }
    return {
      primary: 'WEBSITE_REDESIGN',
      allRequired: ['WEBSITE_REDESIGN'],
      compatibleServices: [
        'WEBSITE_REDESIGN',
        'WEBSITE_DEVELOPMENT',
        'CUSTOM_SOFTWARE',
        'WEB_APP',
        ...(niche === 'DENTAL_CLINIC' || niche === 'MEDICAL' ? ['BOOKING_SYSTEM'] : []),
        ...(niche === 'RETAIL' ? ['ECOMMERCE'] : []),
      ],
      secondary: Array.from(new Set(secondary)),
      isExplicit: false,
    };
  }

  if (webStatus === 'HAS_WEBSITE') {
    return {
      primary: 'WEBSITE_REDESIGN',
      allRequired: ['WEBSITE_REDESIGN'],
      compatibleServices: [
        'WEBSITE_REDESIGN',
        'MAINTENANCE',
        'SEO',
        'UI_UX',
        'CUSTOM_SOFTWARE',
        'WEB_APP',
        'ECOMMERCE',
        'BOOKING_SYSTEM',
      ],
      secondary: ['SEO', 'MAINTENANCE', 'UI_UX', 'CUSTOM_SOFTWARE'],
      isExplicit: false,
    };
  }

  // NO_WEBSITE or UNKNOWN
  const secondary: string[] = ['LANDING_PAGE', 'SEO'];
  if (niche === 'DENTAL_CLINIC' || niche === 'MEDICAL') {
    secondary.unshift('BOOKING_SYSTEM');
  } else if (niche === 'RETAIL') {
    secondary.unshift('ECOMMERCE');
  } else if (niche === 'REAL_ESTATE' || niche === 'EDUCATION') {
    secondary.unshift('CUSTOM_SOFTWARE');
  }

  return {
    primary: 'WEBSITE_DEVELOPMENT',
    allRequired: ['WEBSITE_DEVELOPMENT'],
    compatibleServices: [
      'WEBSITE_DEVELOPMENT',
      'LANDING_PAGE',
      'ECOMMERCE',
      'BOOKING_SYSTEM',
      'CUSTOM_SOFTWARE',
      'WEB_APP',
    ],
    secondary: Array.from(new Set(secondary)),
    isExplicit: false,
  };
}

const NICHE_SYNONYMS: Record<string, CanonicalNicheCode> = {
  dental: 'DENTAL_CLINIC',
  dental_clinic: 'DENTAL_CLINIC',
  'dental clinic': 'DENTAL_CLINIC',
  'dental clinics': 'DENTAL_CLINIC',
  dentist: 'DENTAL_CLINIC',
  'عيادات الأسنان': 'DENTAL_CLINIC',
  'عيادة أسنان': 'DENTAL_CLINIC',
  'عيادة اسنان': 'DENTAL_CLINIC',
  اسنان: 'DENTAL_CLINIC',
  أسنان: 'DENTAL_CLINIC',

  medical: 'MEDICAL',
  medical_center: 'MEDICAL',
  'medical center': 'MEDICAL',
  'medical centers': 'MEDICAL',
  clinic: 'MEDICAL',
  hospital: 'MEDICAL',
  'المراكز الطبية والعيادات': 'MEDICAL',
  'مركز طبي': 'MEDICAL',
  'عيادة طبية': 'MEDICAL',
  طبي: 'MEDICAL',
  مستشفى: 'MEDICAL',

  pharmacy: 'PHARMACY',
  pharmacies: 'PHARMACY',
  صيدلية: 'PHARMACY',
  صيدليات: 'PHARMACY',

  restaurant: 'RESTAURANT',
  restaurants: 'RESTAURANT',
  'restaurants & cafes': 'RESTAURANT',
  cafe: 'RESTAURANT',
  coffee: 'RESTAURANT',
  'المطاعم والكافيهات': 'RESTAURANT',
  مطعم: 'RESTAURANT',
  مطاعم: 'RESTAURANT',
  كافيه: 'RESTAURANT',

  real_estate: 'REAL_ESTATE',
  'real estate': 'REAL_ESTATE',
  realestate: 'REAL_ESTATE',
  property: 'REAL_ESTATE',
  construction: 'REAL_ESTATE',
  'العقارات والمقاولات': 'REAL_ESTATE',
  عقارات: 'REAL_ESTATE',
  مقاولات: 'REAL_ESTATE',

  education: 'EDUCATION',
  'education & academies': 'EDUCATION',
  academy: 'EDUCATION',
  school: 'EDUCATION',
  training: 'EDUCATION',
  'التعليم والأكاديميات': 'EDUCATION',
  تعليم: 'EDUCATION',
  أكاديمية: 'EDUCATION',
  اكاديمية: 'EDUCATION',
  مدرسة: 'EDUCATION',

  retail: 'RETAIL',
  'retail & stores': 'RETAIL',
  store: 'RETAIL',
  shop: 'RETAIL',
  'التجارة والمحلات التجارية': 'RETAIL',
  تجارة: 'RETAIL',
  محل: 'RETAIL',
  معرض: 'RETAIL',

  beauty: 'BEAUTY',
  'beauty & spa': 'BEAUTY',
  salon: 'BEAUTY',
  spa: 'BEAUTY',
  'مراكز التجميل والعناية': 'BEAUTY',
  تجميل: 'BEAUTY',
  بيوتي: 'BEAUTY',
  صالون: 'BEAUTY',

  automotive: 'AUTOMOTIVE',
  car: 'AUTOMOTIVE',
  cars: 'AUTOMOTIVE',
  auto: 'AUTOMOTIVE',
  'السيارات وخدمات الصيانة': 'AUTOMOTIVE',
  سيارات: 'AUTOMOTIVE',

  gym: 'GYM',
  fitness: 'GYM',
  'fitness center': 'GYM',
  جيم: 'GYM',
  'نادي رياضي': 'GYM',

  law_firm: 'LAW_FIRM',
  'law firm': 'LAW_FIRM',
  legal: 'LAW_FIRM',
  lawyer: 'LAW_FIRM',
  محاماة: 'LAW_FIRM',
  'مكتب محاماة': 'LAW_FIRM',

  other: 'OTHER',
  'other businesses': 'OTHER',
  'أنشطة تجارية أخرى': 'OTHER',
};

export const NICHE_LABELS: Record<string, { en: string; ar: string }> = {
  DENTAL_CLINIC: { en: 'Dental Clinic', ar: 'عيادات الأسنان' },
  MEDICAL: { en: 'Medical Center', ar: 'المراكز الطبية والعيادات' },
  PHARMACY: { en: 'Pharmacy', ar: 'الصيدليات' },
  RESTAURANT: { en: 'Restaurant & Cafe', ar: 'المطاعم والكافيهات' },
  REAL_ESTATE: { en: 'Real Estate', ar: 'العقارات والمقاولات' },
  EDUCATION: { en: 'Education & Academy', ar: 'التعليم والأكاديميات' },
  RETAIL: { en: 'Retail & Store', ar: 'التجارة والمحلات التجارية' },
  BEAUTY: { en: 'Beauty & Spa', ar: 'مراكز التجميل والعناية' },
  AUTOMOTIVE: { en: 'Automotive', ar: 'السيارات وخدمات الصيانة' },
  GYM: { en: 'Gym & Fitness', ar: 'الأندية الرياضية والجيم' },
  LAW_FIRM: { en: 'Law Firm', ar: 'مكاتب المحاماة والاستشارات القانونية' },
  OTHER: { en: 'Other Business', ar: 'أنشطة تجارية أخرى' },
};

export function normalizeNicheCode(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return 'OTHER';
  const trimmed = raw.trim();
  if (!trimmed) return 'OTHER';
  if (trimmed.toUpperCase() === 'ALL') return 'ALL';

  const lower = trimmed.toLowerCase();
  if (NICHE_SYNONYMS[lower]) {
    return NICHE_SYNONYMS[lower];
  }
  const snake = lower.replace(/[\s-]+/g, '_');
  if (NICHE_SYNONYMS[snake]) {
    return NICHE_SYNONYMS[snake];
  }

  if (lower.includes('dental') || lower.includes('اسنان') || lower.includes('أسنان')) {
    return 'DENTAL_CLINIC';
  }
  if (lower.includes('pharm') || lower.includes('صيدل')) {
    return 'PHARMACY';
  }
  if (lower.includes('medic') || lower.includes('طبي') || lower.includes('عياد')) {
    return 'MEDICAL';
  }
  if (lower.includes('restaur') || lower.includes('مطعم') || lower.includes('كافيه')) {
    return 'RESTAURANT';
  }
  if (lower.includes('estate') || lower.includes('عقار')) {
    return 'REAL_ESTATE';
  }
  if (lower.includes('educat') || lower.includes('تعليم') || lower.includes('أكاديم') || lower.includes('اكاديم')) {
    return 'EDUCATION';
  }
  if (lower.includes('retail') || lower.includes('تجار') || lower.includes('متجر')) {
    return 'RETAIL';
  }
  if (lower.includes('beaut') || lower.includes('تجميل') || lower.includes('صالون')) {
    return 'BEAUTY';
  }
  if (lower.includes('auto') || lower.includes('سيار')) {
    return 'AUTOMOTIVE';
  }
  if (lower.includes('gym') || lower.includes('fitness') || lower.includes('جيم')) {
    return 'GYM';
  }
  if (lower.includes('law') || lower.includes('legal') || lower.includes('محام')) {
    return 'LAW_FIRM';
  }

  return trimmed.toUpperCase().replace(/[\s-]+/g, '_');
}

export function getNicheLabel(code: string): { en: string; ar: string } {
  const norm = normalizeNicheCode(code);
  return (
    NICHE_LABELS[norm] || {
      en: code,
      ar: code,
    }
  );
}

export interface NormalizedLocationEntry {
  raw: string;
  canonicalAr: string;
  canonicalEn: string;
  governorateAr: string;
  governorateEn: string;
  isGovernorateName: boolean;
  isCityName: boolean;
  isDistrictName: boolean;
  parentCityAr?: string;
}

const GOVERNORATE_BILINGUAL: Record<string, { ar: string; en: string }> = {
  cairo: { ar: 'القاهرة', en: 'Cairo' },
  القاهرة: { ar: 'القاهرة', en: 'Cairo' },
  القاهره: { ar: 'القاهرة', en: 'Cairo' },

  giza: { ar: 'الجيزة', en: 'Giza' },
  الجيزة: { ar: 'الجيزة', en: 'Giza' },
  الجيزه: { ar: 'الجيزة', en: 'Giza' },

  alexandria: { ar: 'الإسكندرية', en: 'Alexandria' },
  alex: { ar: 'الإسكندرية', en: 'Alexandria' },
  الإسكندرية: { ar: 'الإسكندرية', en: 'Alexandria' },
  الاسكندرية: { ar: 'الإسكندرية', en: 'Alexandria' },
  الاسكندريه: { ar: 'الإسكندرية', en: 'Alexandria' },

  dakahlia: { ar: 'الدقهلية', en: 'Dakahlia' },
  الدقهلية: { ar: 'الدقهلية', en: 'Dakahlia' },
  الدقهليه: { ar: 'الدقهلية', en: 'Dakahlia' },

  gharbia: { ar: 'الغربية', en: 'Gharbia' },
  الغربية: { ar: 'الغربية', en: 'Gharbia' },
  الغربيه: { ar: 'الغربية', en: 'Gharbia' },

  sharqia: { ar: 'الشرقية', en: 'Sharqia' },
  sharkia: { ar: 'الشرقية', en: 'Sharqia' },
  الشرقية: { ar: 'الشرقية', en: 'Sharqia' },
  الشرقيه: { ar: 'الشرقية', en: 'Sharqia' },

  qalyubia: { ar: 'القليوبية', en: 'Qalyubia' },
  kalyobiya: { ar: 'القليوبية', en: 'Qalyubia' },
  qalioubia: { ar: 'القليوبية', en: 'Qalyubia' },
  القليوبية: { ar: 'القليوبية', en: 'Qalyubia' },
  القليوبيه: { ar: 'القليوبية', en: 'Qalyubia' },

  assiut: { ar: 'أسيوط', en: 'Assiut' },
  asyut: { ar: 'أسيوط', en: 'Assiut' },
  أسيوط: { ar: 'أسيوط', en: 'Assiut' },
  اسيوط: { ar: 'أسيوط', en: 'Assiut' },

  'red sea': { ar: 'البحر الأحمر', en: 'Red Sea' },
  red_sea: { ar: 'البحر الأحمر', en: 'Red Sea' },
  'البحر الأحمر': { ar: 'البحر الأحمر', en: 'Red Sea' },
  'البحر الاحمر': { ar: 'البحر الأحمر', en: 'Red Sea' },

  'port said': { ar: 'بورسعيد', en: 'Port Said' },
  port_said: { ar: 'بورسعيد', en: 'Port Said' },
  بورسعيد: { ar: 'بورسعيد', en: 'Port Said' },

  monufia: { ar: 'المنوفية', en: 'Monufia' },
  menoufia: { ar: 'المنوفية', en: 'Monufia' },
  المنوفية: { ar: 'المنوفية', en: 'Monufia' },

  beheira: { ar: 'البحيرة', en: 'Beheira' },
  البحيرة: { ar: 'البحيرة', en: 'Beheira' },

  ismailia: { ar: 'الإسماعيلية', en: 'Ismailia' },
  الإسماعيلية: { ar: 'الإسماعيلية', en: 'Ismailia' },

  suez: { ar: 'السويس', en: 'Suez' },
  السويس: { ar: 'السويس', en: 'Suez' },

  luxor: { ar: 'الأقصر', en: 'Luxor' },
  الأقصر: { ar: 'الأقصر', en: 'Luxor' },

  aswan: { ar: 'أسوان', en: 'Aswan' },
  أسوان: { ar: 'أسوان', en: 'Aswan' },
};

const CITY_BILINGUAL: Record<
  string,
  { cityAr: string; cityEn: string; govAr: string; govEn: string; alsoGov?: boolean }
> = {
  cairo: { cityAr: 'القاهرة', cityEn: 'Cairo', govAr: 'القاهرة', govEn: 'Cairo', alsoGov: true },
  القاهرة: { cityAr: 'القاهرة', cityEn: 'Cairo', govAr: 'القاهرة', govEn: 'Cairo', alsoGov: true },
  القاهره: { cityAr: 'القاهرة', cityEn: 'Cairo', govAr: 'القاهرة', govEn: 'Cairo', alsoGov: true },

  'new cairo': { cityAr: 'القاهرة الجديدة', cityEn: 'New Cairo', govAr: 'القاهرة', govEn: 'Cairo' },
  new_cairo: { cityAr: 'القاهرة الجديدة', cityEn: 'New Cairo', govAr: 'القاهرة', govEn: 'Cairo' },
  'القاهرة الجديدة': { cityAr: 'القاهرة الجديدة', cityEn: 'New Cairo', govAr: 'القاهرة', govEn: 'Cairo' },
  'القاهره الجديده': { cityAr: 'القاهرة الجديدة', cityEn: 'New Cairo', govAr: 'القاهرة', govEn: 'Cairo' },

  helwan: { cityAr: 'حلوان', cityEn: 'Helwan', govAr: 'القاهرة', govEn: 'Cairo' },
  حلوان: { cityAr: 'حلوان', cityEn: 'Helwan', govAr: 'القاهرة', govEn: 'Cairo' },

  giza: { cityAr: 'الجيزة', cityEn: 'Giza', govAr: 'الجيزة', govEn: 'Giza', alsoGov: true },
  الجيزة: { cityAr: 'الجيزة', cityEn: 'Giza', govAr: 'الجيزة', govEn: 'Giza', alsoGov: true },
  الجيزه: { cityAr: 'الجيزة', cityEn: 'Giza', govAr: 'الجيزة', govEn: 'Giza', alsoGov: true },

  'sheikh zayed': { cityAr: 'الشيخ زايد', cityEn: 'Sheikh Zayed', govAr: 'الجيزة', govEn: 'Giza' },
  sheikh_zayed: { cityAr: 'الشيخ زايد', cityEn: 'Sheikh Zayed', govAr: 'الجيزة', govEn: 'Giza' },
  zayed: { cityAr: 'الشيخ زايد', cityEn: 'Sheikh Zayed', govAr: 'الجيزة', govEn: 'Giza' },
  'الشيخ زايد': { cityAr: 'الشيخ زايد', cityEn: 'Sheikh Zayed', govAr: 'الجيزة', govEn: 'Giza' },

  '6 october': { cityAr: '6 أكتوبر', cityEn: '6th of October', govAr: 'الجيزة', govEn: 'Giza' },
  '6th of october': { cityAr: '6 أكتوبر', cityEn: '6th of October', govAr: 'الجيزة', govEn: 'Giza' },
  october: { cityAr: '6 أكتوبر', cityEn: '6th of October', govAr: 'الجيزة', govEn: 'Giza' },
  '6 أكتوبر': { cityAr: '6 أكتوبر', cityEn: '6th of October', govAr: 'الجيزة', govEn: 'Giza' },
  '6 اكتوبر': { cityAr: '6 أكتوبر', cityEn: '6th of October', govAr: 'الجيزة', govEn: 'Giza' },

  alexandria: {
    cityAr: 'الإسكندرية',
    cityEn: 'Alexandria',
    govAr: 'الإسكندرية',
    govEn: 'Alexandria',
    alsoGov: true,
  },
  alex: {
    cityAr: 'الإسكندرية',
    cityEn: 'Alexandria',
    govAr: 'الإسكندرية',
    govEn: 'Alexandria',
    alsoGov: true,
  },
  الإسكندرية: {
    cityAr: 'الإسكندرية',
    cityEn: 'Alexandria',
    govAr: 'الإسكندرية',
    govEn: 'Alexandria',
    alsoGov: true,
  },
  الاسكندرية: {
    cityAr: 'الإسكندرية',
    cityEn: 'Alexandria',
    govAr: 'الإسكندرية',
    govEn: 'Alexandria',
    alsoGov: true,
  },
  الاسكندريه: {
    cityAr: 'الإسكندرية',
    cityEn: 'Alexandria',
    govAr: 'الإسكندرية',
    govEn: 'Alexandria',
    alsoGov: true,
  },

  mansoura: { cityAr: 'المنصورة', cityEn: 'Mansoura', govAr: 'الدقهلية', govEn: 'Dakahlia' },
  المنصورة: { cityAr: 'المنصورة', cityEn: 'Mansoura', govAr: 'الدقهلية', govEn: 'Dakahlia' },
  المنصوره: { cityAr: 'المنصورة', cityEn: 'Mansoura', govAr: 'الدقهلية', govEn: 'Dakahlia' },

  tanta: { cityAr: 'طنطا', cityEn: 'Tanta', govAr: 'الغربية', govEn: 'Gharbia' },
  طنطا: { cityAr: 'طنطا', cityEn: 'Tanta', govAr: 'الغربية', govEn: 'Gharbia' },

  mahalla: {
    cityAr: 'المحلة الكبرى',
    cityEn: 'El Mahalla El Kubra',
    govAr: 'الغربية',
    govEn: 'Gharbia',
  },
  'المحلة الكبرى': {
    cityAr: 'المحلة الكبرى',
    cityEn: 'El Mahalla El Kubra',
    govAr: 'الغربية',
    govEn: 'Gharbia',
  },

  zagazig: { cityAr: 'الزقازيق', cityEn: 'Zagazig', govAr: 'الشرقية', govEn: 'Sharqia' },
  الزقازيق: { cityAr: 'الزقازيق', cityEn: 'Zagazig', govAr: 'الشرقية', govEn: 'Sharqia' },

  '10th of ramadan': {
    cityAr: 'العاشر من رمضان',
    cityEn: '10th of Ramadan',
    govAr: 'الشرقية',
    govEn: 'Sharqia',
  },
  'العاشر من رمضان': {
    cityAr: 'العاشر من رمضان',
    cityEn: '10th of Ramadan',
    govAr: 'الشرقية',
    govEn: 'Sharqia',
  },

  banha: { cityAr: 'بنها', cityEn: 'Banha', govAr: 'القليوبية', govEn: 'Qalyubia' },
  benha: { cityAr: 'بنها', cityEn: 'Banha', govAr: 'القليوبية', govEn: 'Qalyubia' },
  بنها: { cityAr: 'بنها', cityEn: 'Banha', govAr: 'القليوبية', govEn: 'Qalyubia' },

  obour: { cityAr: 'العبور', cityEn: 'Obour', govAr: 'القليوبية', govEn: 'Qalyubia' },
  العبور: { cityAr: 'العبور', cityEn: 'Obour', govAr: 'القليوبية', govEn: 'Qalyubia' },

  assiut: { cityAr: 'أسيوط', cityEn: 'Assiut', govAr: 'أسيوط', govEn: 'Assiut', alsoGov: true },
  asyut: { cityAr: 'أسيوط', cityEn: 'Assiut', govAr: 'أسيوط', govEn: 'Assiut', alsoGov: true },
  أسيوط: { cityAr: 'أسيوط', cityEn: 'Assiut', govAr: 'أسيوط', govEn: 'Assiut', alsoGov: true },
  اسيوط: { cityAr: 'أسيوط', cityEn: 'Assiut', govAr: 'أسيوط', govEn: 'Assiut', alsoGov: true },

  hurghada: { cityAr: 'الغردقة', cityEn: 'Hurghada', govAr: 'البحر الأحمر', govEn: 'Red Sea' },
  الغردقة: { cityAr: 'الغردقة', cityEn: 'Hurghada', govAr: 'البحر الأحمر', govEn: 'Red Sea' },

  'port said': {
    cityAr: 'بورسعيد',
    cityEn: 'Port Said',
    govAr: 'بورسعيد',
    govEn: 'Port Said',
    alsoGov: true,
  },
  بورسعيد: {
    cityAr: 'بورسعيد',
    cityEn: 'Port Said',
    govAr: 'بورسعيد',
    govEn: 'Port Said',
    alsoGov: true,
  },
};

const DISTRICT_ENGLISH_MAP: Record<string, { areaAr: string; cityAr: string; govAr: string }> = {
  'nasr city': { areaAr: 'مدينة نصر', cityAr: 'القاهرة', govAr: 'القاهرة' },
  nasr_city: { areaAr: 'مدينة نصر', cityAr: 'القاهرة', govAr: 'القاهرة' },
  heliopolis: { areaAr: 'مصر الجديدة', cityAr: 'القاهرة', govAr: 'القاهرة' },
  maadi: { areaAr: 'المعادي', cityAr: 'القاهرة', govAr: 'القاهرة' },
  'fifth settlement': { areaAr: 'التجمع الخامس', cityAr: 'القاهرة الجديدة', govAr: 'القاهرة' },
  zamalek: { areaAr: 'الزمالك', cityAr: 'القاهرة', govAr: 'القاهرة' },
  downtown: { areaAr: 'وسط البلد', cityAr: 'القاهرة', govAr: 'القاهرة' },
  shubra: { areaAr: 'شبرا', cityAr: 'القاهرة', govAr: 'القاهرة' },
  mokattam: { areaAr: 'المقطم', cityAr: 'القاهرة', govAr: 'القاهرة' },
  shorouk: { areaAr: 'الشروق', cityAr: 'القاهرة', govAr: 'القاهرة' },
  rehab: { areaAr: 'الرحاب', cityAr: 'القاهرة الجديدة', govAr: 'القاهرة' },
  madinaty: { areaAr: 'مدينتي', cityAr: 'القاهرة الجديدة', govAr: 'القاهرة' },
  dokki: { areaAr: 'الدقي', cityAr: 'الجيزة', govAr: 'الجيزة' },
  mohandessin: { areaAr: 'المهندسين', cityAr: 'الجيزة', govAr: 'الجيزة' },
  agouza: { areaAr: 'العجوزة', cityAr: 'الجيزة', govAr: 'الجيزة' },
  haram: { areaAr: 'الهرم', cityAr: 'الجيزة', govAr: 'الجيزة' },
  faisal: { areaAr: 'فيصل', cityAr: 'الجيزة', govAr: 'الجيزة' },
  smouha: { areaAr: 'سموحة', cityAr: 'الإسكندرية', govAr: 'الإسكندرية' },
  'sidi gaber': { areaAr: 'سيدي جابر', cityAr: 'الإسكندرية', govAr: 'الإسكندرية' },
  roushdy: { areaAr: 'رشدي', cityAr: 'الإسكندرية', govAr: 'الإسكندرية' },
  stanley: { areaAr: 'ستانلي', cityAr: 'الإسكندرية', govAr: 'الإسكندرية' },
  gleem: { areaAr: 'جليم', cityAr: 'الإسكندرية', govAr: 'الإسكندرية' },
  miami: { areaAr: 'ميامي', cityAr: 'الإسكندرية', govAr: 'الإسكندرية' },
};

/**
 * Resolves a location string (city, governorate, or district in Arabic or English)
 * into structured Egyptian hierarchy metadata.
 */
export function resolveLocationHierarchy(raw?: string | null): NormalizedLocationEntry | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (lower === 'unknown' || lower === 'غير معروف' || lower === 'n/a') {
    return null;
  }

  if (CITY_BILINGUAL[lower]) {
    const c = CITY_BILINGUAL[lower];
    return {
      raw: trimmed,
      canonicalAr: c.cityAr,
      canonicalEn: c.cityEn,
      governorateAr: c.govAr,
      governorateEn: c.govEn,
      isGovernorateName: Boolean(c.alsoGov),
      isCityName: true,
      isDistrictName: false,
    };
  }

  if (GOVERNORATE_BILINGUAL[lower]) {
    const g = GOVERNORATE_BILINGUAL[lower];
    return {
      raw: trimmed,
      canonicalAr: g.ar,
      canonicalEn: g.en,
      governorateAr: g.ar,
      governorateEn: g.en,
      isGovernorateName: true,
      isCityName: false,
      isDistrictName: false,
    };
  }

  if (DISTRICT_ENGLISH_MAP[lower]) {
    const d = DISTRICT_ENGLISH_MAP[lower];
    const govInfo = GOVERNORATE_BILINGUAL[d.govAr] || { ar: d.govAr, en: d.govAr };
    return {
      raw: trimmed,
      canonicalAr: d.areaAr,
      canonicalEn: trimmed,
      governorateAr: govInfo.ar,
      governorateEn: govInfo.en,
      isGovernorateName: false,
      isCityName: false,
      isDistrictName: true,
      parentCityAr: d.cityAr,
    };
  }

  for (const gov of EGYPT_LOCATIONS) {
    const govInfo = GOVERNORATE_BILINGUAL[gov.governorate] || {
      ar: gov.governorate,
      en: gov.governorate,
    };
    for (const c of gov.cities) {
      if (c.name === trimmed) {
        return {
          raw: trimmed,
          canonicalAr: c.name,
          canonicalEn: c.name,
          governorateAr: gov.governorate,
          governorateEn: govInfo.en,
          isGovernorateName: c.name === gov.governorate,
          isCityName: true,
          isDistrictName: false,
        };
      }
      if (c.areas.includes(trimmed)) {
        return {
          raw: trimmed,
          canonicalAr: trimmed,
          canonicalEn: trimmed,
          governorateAr: gov.governorate,
          governorateEn: govInfo.en,
          isGovernorateName: false,
          isCityName: false,
          isDistrictName: true,
          parentCityAr: c.name,
        };
      }
    }
  }

  return {
    raw: trimmed,
    canonicalAr: trimmed,
    canonicalEn: trimmed,
    governorateAr: trimmed,
    governorateEn: trimmed,
    isGovernorateName: false,
    isCityName: true,
    isDistrictName: false,
  };
}

const LEAD_TYPE_SYNONYMS: Record<string, CanonicalProjectLeadType> = {
  new_website: 'NEW_WEBSITE',
  'new website': 'NEW_WEBSITE',
  no_website: 'NEW_WEBSITE',
  'no website': 'NEW_WEBSITE',
  'without website': 'NEW_WEBSITE',
  'businesses without websites': 'NEW_WEBSITE',
  'بدون موقع': 'NEW_WEBSITE',
  'موقع جديد': 'NEW_WEBSITE',

  website_redesign: 'WEBSITE_REDESIGN',
  'website redesign': 'WEBSITE_REDESIGN',
  poor_website: 'WEBSITE_REDESIGN',
  'poor website': 'WEBSITE_REDESIGN',
  'old website': 'WEBSITE_REDESIGN',
  'موقع قديم': 'WEBSITE_REDESIGN',
  'موقع ضعيف': 'WEBSITE_REDESIGN',
  'تطوير موقع': 'WEBSITE_REDESIGN',

  ecommerce: 'ECOMMERCE',
  'e-commerce': 'ECOMMERCE',
  e_commerce: 'ECOMMERCE',
  'متجر إلكتروني': 'ECOMMERCE',

  landing_page: 'LANDING_PAGE',
  'landing page': 'LANDING_PAGE',
  landing_pages: 'LANDING_PAGE',
  'صفحة هبوط': 'LANDING_PAGE',

  website_maintenance: 'WEBSITE_MAINTENANCE',
  'website maintenance': 'WEBSITE_MAINTENANCE',
  maintenance: 'WEBSITE_MAINTENANCE',
  has_website: 'WEBSITE_MAINTENANCE',
  'has website': 'WEBSITE_MAINTENANCE',
  'صيانة موقع': 'WEBSITE_MAINTENANCE',

  custom_system: 'CUSTOM_SYSTEM',
  'custom system': 'CUSTOM_SYSTEM',
  custom_software: 'CUSTOM_SYSTEM',
  'نظام مخصص': 'CUSTOM_SYSTEM',
};

export const PROJECT_LEAD_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  NEW_WEBSITE: { en: 'New Website', ar: 'إنشاء موقع إلكتروني جديد' },
  WEBSITE_REDESIGN: { en: 'Website Redesign', ar: 'إعادة تصميم وتحديث موقع حالي' },
  ECOMMERCE: { en: 'E-Commerce Store', ar: 'إنشاء متجر إلكتروني' },
  LANDING_PAGE: { en: 'Landing Page', ar: 'صفحة هبوط إعلانية' },
  WEBSITE_MAINTENANCE: { en: 'Website Maintenance', ar: 'صيانة وتطوير موقع قائم' },
  CUSTOM_SYSTEM: { en: 'Custom Web System', ar: 'نظام ويب مخصص' },
};

export function normalizeProjectLeadType(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'both' || lower === 'all') return 'ALL';
  if (LEAD_TYPE_SYNONYMS[lower]) {
    return LEAD_TYPE_SYNONYMS[lower];
  }
  const snake = lower.replace(/[\s-]+/g, '_');
  if (LEAD_TYPE_SYNONYMS[snake]) {
    return LEAD_TYPE_SYNONYMS[snake];
  }
  if (lower.includes('without website') || lower.includes('no_website') || lower.includes('بدون موقع')) {
    return 'NEW_WEBSITE';
  }
  if (lower.includes('poor_website') || lower.includes('redesign') || lower.includes('موقع قديم')) {
    return 'WEBSITE_REDESIGN';
  }
  return trimmed.toUpperCase().replace(/[\s-]+/g, '_');
}

export function resolveLeadProjectType(lead: MatchableLeadInput): string {
  if (lead.projectLeadType && lead.projectLeadType.trim()) {
    return normalizeProjectLeadType(lead.projectLeadType);
  }
  if (lead.requiredService) {
    const srv = normalizeServiceCode(lead.requiredService);
    if (srv === 'ECOMMERCE') return 'ECOMMERCE';
    if (srv === 'LANDING_PAGE') return 'LANDING_PAGE';
    if (srv === 'WEBSITE_REDESIGN') return 'WEBSITE_REDESIGN';
    if (srv === 'MAINTENANCE') return 'WEBSITE_MAINTENANCE';
    if (srv === 'CUSTOM_SOFTWARE' || srv === 'WEB_APP' || srv === 'BOOKING_SYSTEM') {
      return 'CUSTOM_SYSTEM';
    }
    if (srv === 'WEBSITE_DEVELOPMENT') return 'NEW_WEBSITE';
  }

  const webStatus = (lead.websiteStatus || 'NO_WEBSITE').toUpperCase();
  if (webStatus === 'POOR_WEBSITE') return 'WEBSITE_REDESIGN';
  if (webStatus === 'HAS_WEBSITE') return 'WEBSITE_MAINTENANCE';
  return 'NEW_WEBSITE';
}

export function getLeadTypeLabel(code: string): { en: string; ar: string } {
  const norm = normalizeProjectLeadType(code);
  return (
    PROJECT_LEAD_TYPE_LABELS[norm] || {
      en: code,
      ar: code,
    }
  );
}
