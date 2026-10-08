export interface CategoryOption {
  value: string;
  labelAr: string;
  labelEn: string;
  defaultEstimatedBudget: number;
}

export const BUSINESS_CATEGORIES: CategoryOption[] = [
  { value: 'Dental', labelAr: 'عيادات الأسنان', labelEn: 'Dental Clinics', defaultEstimatedBudget: 12000 },
  { value: 'Medical', labelAr: 'المراكز الطبية والعيادات', labelEn: 'Medical Centers', defaultEstimatedBudget: 15000 },
  { value: 'Restaurant', labelAr: 'المطاعم والكافيهات', labelEn: 'Restaurants & Cafes', defaultEstimatedBudget: 10000 },
  { value: 'Real Estate', labelAr: 'العقارات والمقاولات', labelEn: 'Real Estate', defaultEstimatedBudget: 25000 },
  { value: 'Education', labelAr: 'التعليم والأكاديميات', labelEn: 'Education & Academies', defaultEstimatedBudget: 14000 },
  { value: 'Retail', labelAr: 'التجارة والمحلات التجارية', labelEn: 'Retail & Stores', defaultEstimatedBudget: 9000 },
  { value: 'Beauty', labelAr: 'مراكز التجميل والعناية', labelEn: 'Beauty & Spa', defaultEstimatedBudget: 8500 },
  { value: 'Automotive', labelAr: 'السيارات وخدمات الصيانة', labelEn: 'Automotive', defaultEstimatedBudget: 11000 },
  { value: 'Other', labelAr: 'أنشطة تجارية أخرى', labelEn: 'Other Businesses', defaultEstimatedBudget: 8000 },
];

export const CATEGORY_LABELS_AR: Record<string, string> = Object.fromEntries(
  BUSINESS_CATEGORIES.map((c) => [c.value, c.labelAr])
);

export interface LocationHierarchy {
  governorate: string;
  cities: {
    name: string;
    areas: string[];
  }[];
}

export const EGYPT_LOCATIONS: LocationHierarchy[] = [
  {
    governorate: 'القاهرة',
    cities: [
      {
        name: 'القاهرة',
        areas: ['مدينة نصر', 'مصر الجديدة', 'المعادي', 'التجمع الخامس', 'الزمالك', 'وسط البلد', 'شبرا', 'المقطم', 'الشروق', 'الرحاب'],
      },
      {
        name: 'القاهرة الجديدة',
        areas: ['التجمع الخامس', 'التجمع الأول', 'التجمع الثالث', 'الرحاب', 'مدينتي'],
      },
      {
        name: 'حلوان',
        areas: ['حلوان', 'حدائق حلوان', '15 مايو'],
      },
    ],
  },
  {
    governorate: 'الجيزة',
    cities: [
      {
        name: 'الجيزة',
        areas: ['الدقي', 'المهندسين', 'العجوزة', 'الهرم', 'فيصل', 'حدائق الأهرام'],
      },
      {
        name: 'الشيخ زايد',
        areas: ['الحي الأول', 'الحي الرابع', 'بيفرلي هيلز', 'أركان'],
      },
      {
        name: '6 أكتوبر',
        areas: ['الحصري', 'الحي المتميز', 'الحي السابع', 'الحي الثاني'],
      },
    ],
  },
  {
    governorate: 'الإسكندرية',
    cities: [
      {
        name: 'الإسكندرية',
        areas: ['سموحة', 'سيدي جابر', 'رشدي', 'ستانلي', 'لوران', 'ميامي', 'المنتزه', 'محطة الرمل', 'برج العرب'],
      },
    ],
  },
  {
    governorate: 'الدقهلية',
    cities: [
      {
        name: 'المنصورة',
        areas: ['حي الجامعة', 'المشاية السفلية', 'توريل', 'طلخا', 'شارع الجمهورية'],
      },
    ],
  },
  {
    governorate: 'الغربية',
    cities: [
      {
        name: 'طنطا',
        areas: ['شارع البحر', 'النادي', 'الاستاد'],
      },
      {
        name: 'المحلة الكبرى',
        areas: ['شارع شكري القوتلي', 'السبع بنات'],
      },
    ],
  },
  {
    governorate: 'الشرقية',
    cities: [
      {
        name: 'الزقازيق',
        areas: ['القومية', 'فلل الجامعة', 'شارع المحافظة'],
      },
      {
        name: 'العاشر من رمضان',
        areas: ['الأردنية', 'المجاورة الأولى', 'المنطقة الصناعية'],
      },
    ],
  },
  {
    governorate: 'القليوبية',
    cities: [
      {
        name: 'بنها',
        areas: ['الفلل', 'كورنيش النيل', 'الأتريب'],
      },
      {
        name: 'العبور',
        areas: ['الحي الأول', 'الحي التاسع', 'جولف سيتي'],
      },
    ],
  },
  {
    governorate: 'أسيوط',
    cities: [
      {
        name: 'أسيوط',
        areas: ['شارع الجمهورية', 'فريال', 'الوليدية'],
      },
    ],
  },
  {
    governorate: 'البحر الأحمر',
    cities: [
      {
        name: 'الغردقة',
        areas: ['الكوثر', 'الدهار', 'سقارة', 'الممشى السياحي'],
      },
    ],
  },
  {
    governorate: 'بورسعيد',
    cities: [
      {
        name: 'بورسعيد',
        areas: ['الشرق', 'العرب', 'الزهور', 'بورفؤاد'],
      },
    ],
  },
];

export const ALL_GOVERNORATES = EGYPT_LOCATIONS.map((g) => g.governorate);

export const ALL_CITIES = Array.from(
  new Set(EGYPT_LOCATIONS.flatMap((g) => g.cities.map((c) => c.name)))
);

export const DEVELOPER_SERVICES = [
  { value: 'Website Development', labelAr: 'تطوير مواقع الشركات والتعريفية' },
  { value: 'E-Commerce Development', labelAr: 'تطوير المتاجر الإلكترونية' },
  { value: 'Landing Pages', labelAr: 'صفحات الهبوط والحملات الإعلانية' },
  { value: 'Website Redesign', labelAr: 'إعادة تصميم وتحديث المواقع القديمة' },
  { value: 'Booking & Clinic Systems', labelAr: 'مواقع الحجز للعيادات والمراكز الطبية' },
  { value: 'Custom Web Applications', labelAr: 'تطبيقات الويب والأنظمة المخصصة' },
];

export const WEBSITE_STATUS_LABELS: Record<string, { labelAr: string; badgeClass: string }> = {
  NO_WEBSITE: {
    labelAr: 'لا يوجد موقع إلكتروني',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  POOR_WEBSITE: {
    labelAr: 'موقع قديم / ضعيف تقنيًا',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  HAS_WEBSITE: {
    labelAr: 'يمتلك موقعًا إلكترونيًا',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  UNKNOWN: {
    labelAr: 'غير معروف',
    badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

export const TEMPERATURE_LABELS: Record<string, { labelAr: string; labelEn: string; badgeClass: string }> = {
  PREMIUM: {
    labelAr: 'فرصة ممتازة (PREMIUM)',
    labelEn: 'PREMIUM',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  HOT: {
    labelAr: 'فرصة ساخنة (HOT)',
    labelEn: 'HOT',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  WARM: {
    labelAr: 'فرصة دافئة (WARM)',
    labelEn: 'WARM',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  COLD: {
    labelAr: 'فرصة باردة (COLD)',
    labelEn: 'COLD',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
  },
};

export const PIPELINE_STATUS_LABELS: Record<string, { labelAr: string; badgeClass: string }> = {
  NEW: { labelAr: 'جديد', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  CONTACTED: { labelAr: 'تم التواصل', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  REPLIED: { labelAr: 'تم الرد', badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  INTERESTED: { labelAr: 'مهتم بالعرض', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  MEETING: { labelAr: 'اجتماع محدد', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
  WON: { labelAr: 'صفقة ناجحة (WON)', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  LOST: { labelAr: 'صفقة خاسرة (LOST)', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' },
  NOT_INTERESTED: { labelAr: 'غير مهتم', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
  INVALID: { labelAr: 'بيانات غير صالحة', badgeClass: 'bg-red-100 text-red-800 border-red-300' },
};

export const FEEDBACK_REASON_LABELS: Record<string, string> = {
  WRONG_PHONE: 'رقم الهاتف غير صحيح',
  BUSINESS_CLOSED: 'النشاط التجاري مغلق',
  ALREADY_HAS_WEBSITE: 'يمتلك موقعًا حديثًا بالفعل',
  NOT_INTERESTED: 'غير مهتم بخدمات الويب',
  DUPLICATE: 'عميل مكرر',
  WRONG_CATEGORY: 'تصنيف النشاط غير صحيح',
  WRONG_LOCATION: 'الموقع الجغرافي غير صحيح',
  OTHER: 'سبب آخر',
};

export const SCORE_RANGES = [
  { value: '85-100', labelAr: '85 – 100 (ممتاز / Premium)', min: 85, max: 100 },
  { value: '70-84', labelAr: '70 – 84 (ساخن / Hot)', min: 70, max: 84 },
  { value: '50-69', labelAr: '50 – 69 (دافئ / Warm)', min: 50, max: 69 },
  { value: '0-49', labelAr: '0 – 49 (بارد / Cold)', min: 0, max: 49 },
];

export const DEFAULT_PLANS = [
  {
    slug: 'free',
    name: 'الباقة المجانية (Free)',
    nameEn: 'Free',
    priceEgp: 0,
    monthlyCredits: 3,
    allowsExclusive: false,
    maxConcurrentClaims: 10,
    features: [
      '3 نقاط رصيد (3 Leads) للتجربة',
      'الوصول إلى فرص العملاء المشتركة (Shared Leads)',
      'تصفية متقدمة حسب المدينة والتصنيف',
      'عرض أسباب التأهيل وتقييم الفرص',
    ],
    isActive: true,
    sortOrder: 1,
  },
  {
    slug: 'starter',
    name: 'باقة البداية (Starter)',
    nameEn: 'Starter',
    priceEgp: 299,
    monthlyCredits: 20,
    allowsExclusive: true,
    maxConcurrentClaims: 50,
    features: [
      '20 نقطة رصيد شهريًا (20 Leads)',
      'إمكانية الحصول على الفرص الحصرية والمشتركة',
      'مطابقة ذكية تلقائية حسب تخصصك ومدينتك',
      'تحليل فني كامل للمواقع القديمة أو الضعيفة',
      'نظام إدارة ومتابعة العملاء (CRM Pipeline)',
    ],
    isActive: true,
    sortOrder: 2,
  },
  {
    slug: 'pro',
    name: 'الباقة الاحترافية (Pro)',
    nameEn: 'Pro',
    priceEgp: 599,
    monthlyCredits: 50,
    allowsExclusive: true,
    maxConcurrentClaims: 150,
    features: [
      '50 نقطة رصيد شهريًا (50 Leads)',
      'أولوية الوصول للفرص الساخنة (HOT & PREMIUM)',
      'دعم الفرص الحصرية بالكامل (Exclusive Leads)',
      'تنبيهات فورية عند توفر عملاء مطابقين لملفك',
      'تتبع كامل لمراحل التعاقد والملاحظات',
    ],
    isActive: true,
    sortOrder: 3,
  },
  {
    slug: 'business',
    name: 'باقة الشركات والوكالات (Business)',
    nameEn: 'Business',
    priceEgp: 999,
    monthlyCredits: 100,
    allowsExclusive: true,
    maxConcurrentClaims: 500,
    features: [
      '100 نقطة رصيد شهريًا (100 Leads)',
      'مخصصة لشركات البرمجة ووكالات تطوير المواقع',
      'أولوية قصوى في الفرص الحصرية ذات الميزانيات المرتفعة',
      'تقارير تحويل وأداء تفصيلية للفريق',
      'دعم فني مخصص وتحديث دوري للبيانات',
    ],
    isActive: true,
    sortOrder: 4,
  },
];

