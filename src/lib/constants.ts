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

export const CATEGORY_LABELS_EN: Record<string, string> = Object.fromEntries(
  BUSINESS_CATEGORIES.map((c) => [c.value, c.labelEn])
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

export const WEBSITE_STATUS_LABELS: Record<string, { labelAr: string; labelEn: string; badgeClass: string }> = {
  NO_WEBSITE: {
    labelAr: 'لا يوجد موقع إلكتروني',
    labelEn: 'No Website',
    badgeClass: 'bg-brand-soft text-brand border-line-brand',
  },
  POOR_WEBSITE: {
    labelAr: 'موقع قديم / ضعيف تقنيًا',
    labelEn: 'Outdated / Poor Website',
    badgeClass: 'bg-warning-bg text-warning-text border-warning-border',
  },
  HAS_WEBSITE: {
    labelAr: 'يمتلك موقعًا إلكترونيًا',
    labelEn: 'Has Website',
    badgeClass: 'bg-subtle text-fg-secondary border-line',
  },
  UNKNOWN: {
    labelAr: 'غير معروف',
    labelEn: 'Unknown',
    badgeClass: 'bg-subtle text-fg-muted border-line',
  },
};

export const TEMPERATURE_LABELS: Record<string, { labelAr: string; labelEn: string; badgeClass: string }> = {
  PREMIUM: {
    labelAr: 'فرصة ممتازة (PREMIUM)',
    labelEn: 'PREMIUM',
    badgeClass: 'bg-brand-soft text-brand border-line-brand',
  },
  HOT: {
    labelAr: 'فرصة ساخنة (HOT)',
    labelEn: 'HOT',
    badgeClass: 'bg-brand-soft text-brand border-line-brand',
  },
  WARM: {
    labelAr: 'فرصة دافئة (WARM)',
    labelEn: 'WARM',
    badgeClass: 'bg-warning-bg text-warning-text border-warning-border',
  },
  COLD: {
    labelAr: 'فرصة باردة (COLD)',
    labelEn: 'COLD',
    badgeClass: 'bg-subtle text-fg-secondary border-line',
  },
};

export const PIPELINE_STATUS_LABELS: Record<string, { labelAr: string; labelEn: string; badgeClass: string }> = {
  NEW: { labelAr: 'جديد (مُقتنص)', labelEn: 'New (Claimed)', badgeClass: 'bg-brand-soft text-brand border-line-brand' },
  CLAIMED: { labelAr: 'مُقتنص (CLAIMED)', labelEn: 'Claimed', badgeClass: 'bg-brand-soft text-brand border-line-brand' },
  CONTACTED: { labelAr: 'تم التواصل', labelEn: 'Contacted', badgeClass: 'bg-subtle text-fg-primary border-line' },
  REPLIED: { labelAr: 'تم الرد', labelEn: 'Replied', badgeClass: 'bg-brand-soft text-brand border-line' },
  INTERESTED: { labelAr: 'مهتم بالعرض', labelEn: 'Interested', badgeClass: 'bg-brand-soft text-brand border-line-brand' },
  MEETING: { labelAr: 'اجتماع محدد', labelEn: 'Meeting Scheduled', badgeClass: 'bg-brand-soft text-brand border-line-brand' },
  PROPOSAL_SENT: { labelAr: 'تم إرسال العرض الفني/المالي', labelEn: 'Proposal Sent', badgeClass: 'bg-brand-soft text-brand border-line' },
  NEGOTIATION: { labelAr: 'مرحلة التفاوض النهائي', labelEn: 'Negotiation', badgeClass: 'bg-brand-soft text-brand border-line' },
  WON: { labelAr: 'صفقة ناجحة (WON)', labelEn: 'Deal Won', badgeClass: 'bg-brand-soft-strong text-brand font-semibold border-line-brand' },
  LOST: { labelAr: 'صفقة خاسرة (LOST)', labelEn: 'Deal Lost', badgeClass: 'bg-subtle text-fg-secondary border-line' },
  NOT_INTERESTED: { labelAr: 'غير مهتم', labelEn: 'Not Interested', badgeClass: 'bg-subtle text-fg-secondary border-line' },
  INVALID: { labelAr: 'بيانات غير صالحة', labelEn: 'Invalid Lead', badgeClass: 'bg-danger-bg text-danger-text border-danger-border' },
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

export const FEEDBACK_REASON_LABELS_EN: Record<string, string> = {
  WRONG_PHONE: 'Wrong Phone Number',
  BUSINESS_CLOSED: 'Business Permanently Closed',
  ALREADY_HAS_WEBSITE: 'Already Has Modern Website',
  NOT_INTERESTED: 'Not Interested in Web Services',
  DUPLICATE: 'Duplicate Lead',
  WRONG_CATEGORY: 'Incorrect Business Category',
  WRONG_LOCATION: 'Incorrect Location',
  OTHER: 'Other Reason',
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

