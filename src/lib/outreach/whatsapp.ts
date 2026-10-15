/**
 * LeadForge Egypt — WhatsApp Outreach & Pitch Generator
 * 
 * Complies with LeadForge Design System:
 * - Western digits formatted in ltr-iso
 * - Explainable Egyptian Arabic business communication
 * - Sector-specific Egyptian market pitches (Dentistry, Medical, Restaurants, Real Estate, Contracting, Retail, Auto, Law)
 * - Anti-spam dual modes: Permission-Based (no links) vs. Direct Link (with portfolio)
 * - 48h Follow-up cadences
 * - Clean international normalization (+20)
 */

export interface NormalizedPhone {
  raw: string;
  cleanDigits: string;
  waPhone: string; // Suitable for https://wa.me/201xxxxxxxx
  displayFormatted: string; // e.g. "+20 10 1234 5678"
  isValidEgyptianMobile: boolean;
}

export function normalizeEgyptianPhone(rawPhone?: string | null): NormalizedPhone {
  if (!rawPhone) {
    return {
      raw: '',
      cleanDigits: '',
      waPhone: '',
      displayFormatted: 'غير متوفر',
      isValidEgyptianMobile: false,
    };
  }

  // Remove whitespace, dashes, parens
  let digits = rawPhone.replace(/[^\d+]/g, '');

  // Handle + prefix
  if (digits.startsWith('+')) {
    digits = digits.substring(1);
  }

  // Handle 002 prefix
  if (digits.startsWith('002')) {
    digits = digits.substring(3);
  }

  // Handle 01x local mobile prefix -> 201x
  if (digits.startsWith('01') && digits.length === 11) {
    digits = `2${digits}`;
  } else if (digits.startsWith('1') && digits.length === 10) {
    digits = `20${digits}`;
  }

  const isValidEgyptianMobile = /^201[0125]\d{8}$/.test(digits);

  // Format display
  let displayFormatted = rawPhone;
  if (isValidEgyptianMobile) {
    const carrier = digits.substring(2, 4); // 10, 11, 12, 15
    const part1 = digits.substring(4, 8);
    const part2 = digits.substring(8);
    displayFormatted = `+20 ${carrier} ${part1} ${part2}`;
  }

  return {
    raw: rawPhone,
    cleanDigits: digits,
    waPhone: digits,
    displayFormatted,
    isValidEgyptianMobile,
  };
}

export type OutreachMode = 'PERMISSION_BASED' | 'DIRECT_LINK';

export interface PitchTemplate {
  id: string;
  title: string;
  sector: string;
  description: string;
  text: string;
  isFollowUp?: boolean;
}

export interface LeadPitchContext {
  businessName: string;
  category: string;
  city?: string | null;
  governorate?: string | null;
  website?: string | null;
  websiteStatus?: string | null;
  developerName?: string;
  companyName?: string;
  portfolioUrl?: string;
  mode?: OutreachMode;
}

export function generateEgyptianPitchTemplates(context: LeadPitchContext): {
  recommendedId: string;
  templates: PitchTemplate[];
} {
  const name = context.businessName.trim();
  const city = context.city?.trim() || 'مصر';
  const mode = context.mode || 'PERMISSION_BASED';
  const devTitle = context.companyName
    ? `فريق ${context.companyName}`
    : context.developerName
    ? `المهندس ${context.developerName}`
    : 'مهندس برمجيات وتطبيقات ويب';

  const portfolioSuffix =
    mode === 'DIRECT_LINK' && context.portfolioUrl?.trim()
      ? `\n\nتقدر حضرتك تطلع على نماذج أعمالنا ومشاريع مماثلة من هنا:\n${context.portfolioUrl.trim()}`
      : '';

  const ctaPermission =
    mode === 'PERMISSION_BASED'
      ? 'لو وقت حضرتك يسمح بدقيقة، يشرفني أشارك مع حضرتك سابقة أعمالنا وتفاصيل المقترح؟'
      : 'يسعدني جداً معرفة رأي حضرتك وتنسيق اتصال أو جلسة سريعة لمناقشة التفاصيل.';

  const categoryLower = (context.category || '').toLowerCase();
  const nameLower = name.toLowerCase();

  const isDental =
    categoryLower.includes('dent') ||
    categoryLower.includes('أسنان') ||
    nameLower.includes('أسنان') ||
    nameLower.includes('dental');

  const isMedical =
    !isDental &&
    (categoryLower.includes('clinic') ||
      categoryLower.includes('medical') ||
      categoryLower.includes('doctor') ||
      categoryLower.includes('عياد') ||
      categoryLower.includes('طب') ||
      nameLower.includes('عيادة') ||
      nameLower.includes('دكتور'));

  const isRestaurant =
    categoryLower.includes('rest') ||
    categoryLower.includes('cafe') ||
    categoryLower.includes('مطعم') ||
    categoryLower.includes('كافيه') ||
    nameLower.includes('مطعم') ||
    nameLower.includes('كافيه') ||
    nameLower.includes('burger') ||
    nameLower.includes('pizza');

  const isRealEstate =
    categoryLower.includes('real') ||
    categoryLower.includes('estate') ||
    categoryLower.includes('عقار') ||
    nameLower.includes('عقارات') ||
    nameLower.includes('استثمار عقاري') ||
    nameLower.includes('broker');

  const isContracting =
    categoryLower.includes('contract') ||
    categoryLower.includes('decor') ||
    categoryLower.includes('interior') ||
    categoryLower.includes('مقاول') ||
    categoryLower.includes('تشطيب') ||
    categoryLower.includes('ديكور') ||
    nameLower.includes('تشطيبات') ||
    nameLower.includes('ديكور');

  const isRetail =
    categoryLower.includes('retail') ||
    categoryLower.includes('boutique') ||
    categoryLower.includes('store') ||
    categoryLower.includes('محل') ||
    categoryLower.includes('ملابس') ||
    categoryLower.includes('تجزئة');

  const isAuto =
    categoryLower.includes('auto') ||
    categoryLower.includes('car') ||
    categoryLower.includes('سيارات') ||
    nameLower.includes('موتورز') ||
    nameLower.includes('صيانة سيارات');

  const isLaw =
    categoryLower.includes('law') ||
    categoryLower.includes('legal') ||
    categoryLower.includes('محام') ||
    categoryLower.includes('استشارات') ||
    nameLower.includes('محامي') ||
    nameLower.includes('قانون');

  const hasNoWebsite = !context.website || context.websiteStatus === 'NO_WEBSITE';

  // 1. Dental Clinics
  const dentalText = `مساء الخير يا دكتور، بتشرف بالتواصل مع إدارة ${name}.

أنا ${devTitle}، متخصص في تطوير الأنظمة والمواقع الطبية لعيادات الأسنان في ${city}.
لاحظت تميزكم ما شاء الله، وحبينا نقترح حل رقمي مخصص لعيادات الأسنان يساعدكم في:
• صفحة كشوفات احترافية لعرض خدمات زراعة، تقويم، وتجميل الأسنان وحالات (قبل/بعد).
• نظام حجز مواعيد إلكتروني منظم مع تنبيهات واتساب تلقائية لتأكيد الموعد وتقليل غياب المرضى (No-Show).
• الظهور في أول نتائج بحث جوجل لمرضى ${city} الباحثين عن دكتور أسنان.${portfolioSuffix}

${ctaPermission}`;

  // 2. Specialty Medical Clinics & Doctors
  const medicalText = `مرحباً بحضرتك يا فندم، تحياتي لإدارة ومكتب الدكتور في ${name}.

أنا ${devTitle}، بنساعد الأطباء والمراكز الطبية في ${city} في رقمنة حجز الكشوفات وبناء تواجد رقمي موثوق:
• موقع طبي رسمي متوافق 100% مع الموبايل يوضح مواعيد العيادة وموقع الفروع.
• نظام حجز أونلاين ذكي ينظم كشوفات العيادة ويستقبل بيانات المريض على واتساب العيادة مباشرة.
• توثيق سمعة العيادة وظهورها القوي على خرائط وبحث جوجل.${portfolioSuffix}

${ctaPermission}`;

  // 3. Restaurants & Cafes
  const restaurantText = `مساء الخير يا فندم، تحياتي لإدارة ${name} الكرام.

أنا ${devTitle}، بنوفر حل تقني مخصص للمطاعم والكافيهات في ${city}:
• منيو ديجيتال QR تفاعلي فائق السرعة بدون أي عمولات لتطبيقات التوصيل.
• استلام الأوردرات بتفاصيل الأصناف والإضافات مع لوكيشن العميل تلقائياً ومباشرة على واتساب الفرع.
• لوحة تحكم سهلة جداً لتعديل الأسعار والعروض اللحظية من الموبايل.${portfolioSuffix}

${ctaPermission}`;

  // 4. Real Estate & Brokers
  const realEstateText = `أهلاً بحضرتك يا فندم، بتشرف بالتواصل مع مسؤولي المبيعات في ${name}.

أنا ${devTitle}، بنبني منصات تسويق وصفحات هبوط (Landing Pages) مخصصة لشركات وبروكرز العقارات في ${city}:
• صفحات سريعة لعرض المشروعات والوحدات (سكني، تجاري، ساحلي) مع خطط السداد وتفاصيل المطورين.
• ربط فوري لاستقبال طلبات وليدز المشترين المهتمين مباشرة على واتساب فريق المبيعات.
• تكامل مباشر مع الحملات الإعلانية ومحركات البحث لتعظيم معدل التحويل.${portfolioSuffix}

${ctaPermission}`;

  // 5. Contracting, Decor & Interior Design
  const contractingText = `مساء الخير يا فندم، بتشرف بالتواصل مع إدارة ${name}.

أنا ${devTitle}، بنساعد شركات التشطيبات والديكور في ${city} في تحويل استفسارات السوشيال ميديا لتعاقدات فعلية:
• بورتفوليو رقمي فاخر لعرض سابقة الأعمال، صور وفيديوهات المشروعات قبل وبعد التشطيب بجودة عالية.
• حاسبة تكلفة تشطيب مبدئية تفاعلية للعملاء تساعد في تصفية واستقبال العملاء الجادين فقط.
• بناء ثقة ومصداقية كاملة تبرز هوية وتراخيص شركتكم.${portfolioSuffix}

${ctaPermission}`;

  // 6. Boutiques & Retail
  const retailText = `أهلاً بحضرتك يا فندم، بتواصل مع القائمين على ${name}.

أنا ${devTitle}، بنوفر حلولاً للمتاجر والبراندات في ${city} لتسهيل البيع وزيادة المبيعات:
• كتالوج منتجات رقمي تفاعلي سريع يعرض المقاسات والألوان والأسعار بوضوح.
• طلب مباشر وسريع بنقرة واحدة على واتساب المحل بدون تعقيدات سلة الشراء الطويلة.
• تقليل الاستفسارات المتكررة حول الأسعار والمقاسات المتاحة.${portfolioSuffix}

${ctaPermission}`;

  // 7. Automotive Services
  const autoText = `مساء الخير يا فندم، تحياتي لإدارة مركز ${name}.

أنا ${devTitle}، متخصص في تطوير حلول الويب لمراكز وخدمات السيارات في ${city}:
• صفحة رسمية لخدمات الفحص، الصيانة الدورية، وقطع الغيار.
• نظام طلب وتسجيل موعد صيانة مسبق يرسل تفاصيل السيارة والمشكلة على واتساب المركز.
• التواجد في أول نتائج خرائط جوجل وسهولة وصول أصحاب السيارات لكم في حالات الطوارئ.${portfolioSuffix}

${ctaPermission}`;

  // 8. Law & Consulting
  const lawText = `مرحباً بحضرتك يا فندم، بتشرف بالتواصل مع مكتب ${name}.

أنا ${devTitle}، بنساعد المكاتب القانونية والاستشارية في بناء واجهة رقمية تعكس الرصانة والاحتراف:
• موقع رسمي يبرز مجالات التخصص، الخبرات، وسوابق الاستشارات مع الحفاظ على سرية وخصوصية العملاء.
• نموذج حجز استشارات قانونية مسبقة ينظم مواعيد المكتب وتفاصيل الموكلين.
• توثيق الهوية المهنية وبناء ثقة العملاء والشركات الجديدة.${portfolioSuffix}

${ctaPermission}`;

  // 9. General - New Official Website
  const newWebsiteText = `مساء الخير يا فندم، بتشرف بالتواصل مع إدارة ${name}.

أنا ${devTitle}، لاحظت إن نشاطكم في ${city} متميز وله تواجد طيب ما شاء الله، لكن مفيش موقع إلكتروني رسمي يظهر لعملاء ${city} على بحث وخرائط جوجل.

إحنا بنصمم مواقع رسمية سريعة ومتوافقة 100% مع الموبايل بتساعدكم في:
• الظهور في أول نتائج بحث جوجل للعملاء الباحثين عن خدماتكم في ${city}.
• توثيق هويتكم وبناء مصداقية كاملة تزيد من تعاقدات العملاء الجدد.
• استقبال طلبات واستفسارات العملاء مباشرة على واتساب النشاط.${portfolioSuffix}

${ctaPermission}`;

  // 10. General - Redesign & Optimization
  const redesignText = `أهلاً بحضرتك يا فندم، بتواصل مع القائمين على ${name} بخصوص موقعكم الإلكتروني.

أنا ${devTitle}، وأثناء فحص سريع لموقع ${name}، لاحظت بعض النقاط التقنية التي قد تؤثر على سرعة التصفح وتجربة العميل من الموبايل، مما قد يقلل من تحويل الزوار لعملاء فعليين.

يسرنا أن نقدم لحضرتكم مقترحاً لتطوير الموقع:
• تسريع تحميل الصفحات وتوافق تام مع كافة الهواتف الذكية.
• تحسين تجربة المستخدم ورفع ترتيب الموقع في بحث جوجل (SEO).
• ربط مباشر بنظام حجز وتواصل فوري عبر واتساب.${portfolioSuffix}

${ctaPermission}`;

  // 11. 48-Hour Polite Follow-Up Pitch
  const followUpText = `مساء الخير يا فندم، بتمنى لحضرتك يوماً طيباً وموفقاً.

بتواصل مع حضرتك للمتابعة بخصوص مقترح تطوير الواجهة الرقمية لنشاط ${name} اللي شاركته مع حضرتك من يومين.

حبيت أتأكد إذا كان وقت حضرتك يسمح حالياً بنقاش سريع، أو لو تفضل ننسق في وقت لاحق يكون أنسب لحضرتك؟

خالص تحياتي وتقديري.`;

  const templates: PitchTemplate[] = [
    {
      id: 'DENTAL_CLINIC',
      title: 'عيادات الأسنان (حجوزات وتجميل)',
      sector: 'طب الأسنان',
      description: 'مخصص لأطباء وعيادات الأسنان: تنظيم الحجوزات، عرض الحالات، وتقليل التخلف عن المواعيد.',
      text: dentalText,
    },
    {
      id: 'MEDICAL_SPECIALTY',
      title: 'العيادات والمراكز الطبية التخصصية',
      sector: 'القطاع الطبي',
      description: 'للأطباء والمراكز المتخصصة: توثيق الهوية الطبية، أوقات الكشوفات، والحجز الفوري.',
      text: medicalText,
    },
    {
      id: 'RESTAURANT_CAFE',
      title: 'المطاعم والكافيهات (منيو QR بدون عمولة)',
      sector: 'مطاعم وأغذية',
      description: 'منيو ديجيتال واستقبال الأوردر واللوكيشن على واتساب الفرع مباشرة لتوفير عمولات التطبيقات.',
      text: restaurantText,
    },
    {
      id: 'REAL_ESTATE',
      title: 'العقارات والبروكرز (ليدز المشروعات)',
      sector: 'التطوير العقاري',
      description: 'صفحات هبوط لمشروعات التجمع وزايد والساحل، وجلب ليدز المشترين مباشرة لواتساب المبيعات.',
      text: realEstateText,
    },
    {
      id: 'CONTRACTING_DECOR',
      title: 'المقاولات والتشطيبات والديكور',
      sector: 'مقاولات وديكور',
      description: 'بورتفوليو احترافي لسابقة الأعمال قبل وبعد التشطيب مع حاسبة تكلفة تفرز العملاء الجادين.',
      text: contractingText,
    },
    {
      id: 'RETAIL_BOUTIQUE',
      title: 'المتاجر والبوتيكات (كتالوج مبيعات)',
      sector: 'تجزئة وتجارة',
      description: 'عرض الكتالوج والأسعار والمقاسات مع زر شراء مباشر على واتساب بدون تعقيدات السلة.',
      text: retailText,
    },
    {
      id: 'AUTO_SERVICES',
      title: 'مراكز صيانة وخدمات السيارات',
      sector: 'خدمات سيارات',
      description: 'حجز مواعيد الصيانة والفحص وتسهيل وصول العملاء من خرائط جوجل في حالات الطوارئ.',
      text: autoText,
    },
    {
      id: 'LAW_CONSULTING',
      title: 'المحاماة والاستشارات المهنية',
      sector: 'استشارات وقانون',
      description: 'واجهة رصينة تبرز سوابق الخبرة والاستشارات وحجز المواعيد مع الحفاظ على السرية.',
      text: lawText,
    },
    {
      id: 'NEW_WEBSITE',
      title: 'إنشاء موقع رسمي جديد (عام)',
      sector: 'عام',
      description: 'للأنشطة التي لا تمتلك موقعاً وتريد الظهور في جوجل وبناء ثقة العملاء.',
      text: newWebsiteText,
    },
    {
      id: 'REDESIGN',
      title: 'تطوير وتسريع الموقع الحالي (عام)',
      sector: 'عام',
      description: 'للأنشطة التي لديها موقع قديم أو بطيء يحتاج توافقاً مع الموبايل ومحركات البحث.',
      text: redesignText,
    },
    {
      id: 'FOLLOW_UP_48H',
      title: 'متابعة مهذبة بعد 48 ساعة (Follow-up)',
      sector: 'متابعة المبيعات',
      description: 'رسالة متابعة ذكية مهذبة للتذكير بعد يومين من المحادثة الأولى دون إزعاج.',
      text: followUpText,
      isFollowUp: true,
    },
  ];

  // Determine intelligent recommendation
  let recommendedId = 'NEW_WEBSITE';

  if (isDental) {
    recommendedId = 'DENTAL_CLINIC';
  } else if (isMedical) {
    recommendedId = 'MEDICAL_SPECIALTY';
  } else if (isRestaurant) {
    recommendedId = 'RESTAURANT_CAFE';
  } else if (isRealEstate) {
    recommendedId = 'REAL_ESTATE';
  } else if (isContracting) {
    recommendedId = 'CONTRACTING_DECOR';
  } else if (isRetail) {
    recommendedId = 'RETAIL_BOUTIQUE';
  } else if (isAuto) {
    recommendedId = 'AUTO_SERVICES';
  } else if (isLaw) {
    recommendedId = 'LAW_CONSULTING';
  } else if (!hasNoWebsite) {
    recommendedId = 'REDESIGN';
  }

  return {
    recommendedId,
    templates,
  };
}

export function buildWhatsAppDirectUrl(phone: string, message: string): string {
  const norm = normalizeEgyptianPhone(phone);
  const encodedText = encodeURIComponent(message.trim());
  return `https://wa.me/${norm.waPhone}?text=${encodedText}`;
}
