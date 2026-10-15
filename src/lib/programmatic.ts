/**
 * Programmatic Landing Page Taxonomy & Resolver
 * High-intent landing pages for Egyptian cities and business verticals.
 */

export interface ProgrammaticCity {
  slug: string;
  nameAr: string;
  nameEn: string;
  dbValues: string[];
}

export interface ProgrammaticCategory {
  slug: string;
  nameAr: string;
  nameEn: string;
  dbValues: string[];
}

export const PROGRAMMATIC_CITIES: Record<string, ProgrammaticCity> = {
  cairo: {
    slug: 'cairo',
    nameAr: 'القاهرة',
    nameEn: 'Cairo',
    dbValues: ['القاهرة', 'Cairo', 'cairo'],
  },
  giza: {
    slug: 'giza',
    nameAr: 'الجيزة',
    nameEn: 'Giza',
    dbValues: ['الجيزة', 'Giza', 'giza', 'Giza Governorate'],
  },
  alexandria: {
    slug: 'alexandria',
    nameAr: 'الإسكندرية',
    nameEn: 'Alexandria',
    dbValues: ['الإسكندرية', 'Alexandria', 'alexandria'],
  },
  mansoura: {
    slug: 'mansoura',
    nameAr: 'المنصورة',
    nameEn: 'Mansoura',
    dbValues: ['المنصورة', 'Mansoura'],
  },
  tanta: {
    slug: 'tanta',
    nameAr: 'طنطا',
    nameEn: 'Tanta',
    dbValues: ['طنطا', 'Tanta'],
  },
  'october-6': {
    slug: 'october-6',
    nameAr: '6 أكتوبر',
    nameEn: '6th of October',
    dbValues: ['6 أكتوبر', '6th of October', 'October 6'],
  },
  'sheikh-zayed': {
    slug: 'sheikh-zayed',
    nameAr: 'الشيخ زايد',
    nameEn: 'Sheikh Zayed',
    dbValues: ['الشيخ زايد', 'Sheikh Zayed'],
  },
  'new-cairo': {
    slug: 'new-cairo',
    nameAr: 'القاهرة الجديدة',
    nameEn: 'New Cairo',
    dbValues: ['القاهرة الجديدة', 'New Cairo'],
  },
  'nasr-city': {
    slug: 'nasr-city',
    nameAr: 'مدينة نصر',
    nameEn: 'Nasr City',
    dbValues: ['مدينة نصر', 'Nasr City'],
  },
  heliopolis: {
    slug: 'heliopolis',
    nameAr: 'مصر الجديدة',
    nameEn: 'Heliopolis',
    dbValues: ['مصر الجديدة', 'Heliopolis'],
  },
  maadi: {
    slug: 'maadi',
    nameAr: 'المعادي',
    nameEn: 'Maadi',
    dbValues: ['المعادي', 'Maadi'],
  },
  zagazig: {
    slug: 'zagazig',
    nameAr: 'الزقازيق',
    nameEn: 'Zagazig',
    dbValues: ['الزقازيق', 'Zagazig'],
  },
  hurghada: {
    slug: 'hurghada',
    nameAr: 'الغردقة',
    nameEn: 'Hurghada',
    dbValues: ['الغردقة', 'Hurghada'],
  },
  suez: {
    slug: 'suez',
    nameAr: 'السويس',
    nameEn: 'Suez',
    dbValues: ['السويس', 'Suez'],
  },
  'port-said': {
    slug: 'port-said',
    nameAr: 'بورسعيد',
    nameEn: 'Port Said',
    dbValues: ['بورسعيد', 'Port Said'],
  },
  mahalla: {
    slug: 'mahalla',
    nameAr: 'المحلة الكبرى',
    nameEn: 'El Mahalla',
    dbValues: ['المحلة الكبرى', 'El Mahalla'],
  },
  banha: {
    slug: 'banha',
    nameAr: 'بنها',
    nameEn: 'Banha',
    dbValues: ['بنها', 'Banha'],
  },
  asyut: {
    slug: 'asyut',
    nameAr: 'أسيوط',
    nameEn: 'Asyut',
    dbValues: ['أسيوط', 'Asyut'],
  },
};

export const PROGRAMMATIC_CATEGORIES: Record<string, ProgrammaticCategory> = {
  medical: {
    slug: 'medical',
    nameAr: 'العيادات والمراكز الطبية',
    nameEn: 'Medical & Clinics',
    dbValues: ['Medical', 'المراكز الطبية والعيادات'],
  },
  dental: {
    slug: 'dental',
    nameAr: 'عيادات الأسنان',
    nameEn: 'Dental Clinics',
    dbValues: ['Dental', 'عيادات الأسنان'],
  },
  'real-estate': {
    slug: 'real-estate',
    nameAr: 'العقارات والمقاولات',
    nameEn: 'Real Estate & Contracting',
    dbValues: ['Real Estate', 'العقارات والمقاولات'],
  },
  restaurants: {
    slug: 'restaurants',
    nameAr: 'المطاعم والكافيهات',
    nameEn: 'Restaurants & Cafes',
    dbValues: ['Restaurant', 'المطاعم والكافيهات'],
  },
  retail: {
    slug: 'retail',
    nameAr: 'التجارة والمحلات التجارية',
    nameEn: 'Retail & Stores',
    dbValues: ['Retail', 'التجارة والمحلات التجارية'],
  },
  education: {
    slug: 'education',
    nameAr: 'التعليم والأكاديميات',
    nameEn: 'Education & Academies',
    dbValues: ['Education', 'التعليم والأكاديميات'],
  },
  automotive: {
    slug: 'automotive',
    nameAr: 'السيارات ومراكز الصيانة',
    nameEn: 'Automotive & Repair',
    dbValues: ['Automotive', 'السيارات وخدمات الصيانة'],
  },
  beauty: {
    slug: 'beauty',
    nameAr: 'مراكز التجميل والعناية',
    nameEn: 'Beauty & Spas',
    dbValues: ['Beauty', 'مراكز التجميل والعناية'],
  },
  other: {
    slug: 'other',
    nameAr: 'أنشطة تجارية عامة',
    nameEn: 'General Businesses',
    dbValues: ['Other', 'أنشطة تجارية أخرى'],
  },
};

export function cleanArabicText(text?: string | null): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // Remove Tashkeel & Tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveProgrammaticParams(
  cityParam: string,
  categoryParam: string
): { city: ProgrammaticCity | null; category: ProgrammaticCategory | null } {
  if (!cityParam || !categoryParam) {
    return { city: null, category: null };
  }

  let decodedCity = '';
  let decodedCategory = '';
  try {
    decodedCity = decodeURIComponent(cityParam).toLowerCase().trim();
  } catch {
    decodedCity = cityParam.toLowerCase().trim();
  }

  try {
    decodedCategory = decodeURIComponent(categoryParam).toLowerCase().trim();
  } catch {
    decodedCategory = categoryParam.toLowerCase().trim();
  }

  const cleanCity = cleanArabicText(decodedCity);
  const cleanCategory = cleanArabicText(decodedCategory);

  // Find city
  let matchedCity: ProgrammaticCity | null = null;
  for (const city of Object.values(PROGRAMMATIC_CITIES)) {
    if (
      city.slug === decodedCity ||
      city.nameEn.toLowerCase() === decodedCity ||
      cleanArabicText(city.nameAr) === cleanCity ||
      city.dbValues.some((v) => cleanArabicText(v) === cleanCity || v.toLowerCase() === decodedCity)
    ) {
      matchedCity = city;
      break;
    }
  }

  // Find category
  let matchedCategory: ProgrammaticCategory | null = null;
  for (const category of Object.values(PROGRAMMATIC_CATEGORIES)) {
    if (
      category.slug === decodedCategory ||
      category.nameEn.toLowerCase() === decodedCategory ||
      cleanArabicText(category.nameAr) === cleanCategory ||
      category.dbValues.some((v) => cleanArabicText(v) === cleanCategory || v.toLowerCase() === decodedCategory)
    ) {
      matchedCategory = category;
      break;
    }
  }

  return { city: matchedCity, category: matchedCategory };
}
