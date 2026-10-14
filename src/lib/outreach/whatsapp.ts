/**
 * LeadForge Egypt — WhatsApp Outreach & Pitch Generator
 * 
 * Complies with LeadForge Design System:
 * - Western digits formatted in ltr-iso
 * - Explainable Egyptian Arabic business communication
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

export interface PitchTemplate {
  id: string;
  title: string;
  description: string;
  text: string;
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
}

export function generateEgyptianPitchTemplates(context: LeadPitchContext): {
  recommendedId: string;
  templates: PitchTemplate[];
} {
  const name = context.businessName.trim();
  const city = context.city?.trim() || 'مصر';
  const devTitle = context.companyName ? `فريق ${context.companyName}` : 'مهندس برمجيات وتطبيقات ويب';

  const isRestaurant = context.category === 'Restaurants' || context.category === 'مطاعم' || name.includes('مطعم') || name.includes('كافيه');
  const isClinic = context.category === 'Clinics' || context.category === 'Medical' || context.category === 'عيادات' || name.includes('عيادة') || name.includes('دكتور');
  const hasNoWebsite = !context.website || context.websiteStatus === 'NO_WEBSITE';

  // 1. New Website Proposal
  const newWebsiteText = `مساء الخير يا فندم، بتشرف بالتواصل مع إدارة ${name}.

أنا ${devTitle}، لاحظت إن نشاطكم في ${city} متميز وله تواجد طيب ما شاء الله، لكن مفيش موقع إلكتروني رسمي يظهر لعملاء ${city} على بحث جوجل وخرائط جوجل.

إحنا بنصمم مواقع رسمية سريعة ومتوافقة 100% مع الموبايل بتساعدكم في:
• الظهور في أول نتائج بحث جوجل للعملاء الباحثين عن خدماتكم.
• توثيق هويتكم وبناء مصداقية كاملة أمام العملاء الجدد.
• استقبال طلبات واستفسارات العملاء مباشرة على واتساب.

لو وقت حضرتك يسمح بدقيقة، يشرفني أشارك مع حضرتك سابقة أعمالنا وتفاصيل العرض المخصص لكم؟`;

  // 2. Website Redesign & Modernization Proposal
  const redesignText = `أهلاً بحضرتك يا فندم، بتواصل مع القائمين على ${name} بخصوص موقعكم الإلكتروني.

أنا ${devTitle}، وأثناء فحص سريع لموقع ${name}، لاحظت بعض النقاط التقنية التي قد تؤثر على سرعة التصفح وتجربة المستخدم من الموبايل، وهو ما قد يقلل من تحويل الزوار لعملاء فعليين.

يسرنا أن نقدم لحضرتكم تقريراً فنياً مجانياً ومقترحاً لتطوير الموقع:
• تسريع تحميل الصفحات وتوافق تام مع كافة الهواتف الذكية.
• تحسين تجربة المستخدم ورفع ترتيب الموقع في محركات البحث (SEO).
• ربط مباشر بنظام حجز وتواصل فوري.

هل يناسب حضرتك ننسق اتصالاً قصيراً أو أرسل لحضرتك المقترح الفني؟`;

  // 3. Online Menu & Orders (Restaurants & Retail)
  const ecommerceText = `مساء الخير يا فندم، تحياتي لإدارة ${name} الكرام.

أنا ${devTitle}، بنوفر حلولاً تقنية متخصصة للأنشطة التجارية والمطاعم في ${city}:
• قائمة طعام / متجر إلكتروني تفاعلي سريع بدون عمولات لتطبيقات التوصيل.
• نظام استلام الطلبات وحساب الفاتورة تلقائياً ومباشرة على واتساب فرعكم.
• لوحة تحكم سهلة لإدارة المنتجات والأسعار والعروض اللحظية.

يسعدنا أن نرسل لحضرتك نموذجاً تجريبياً حياً (Demo) لتجربة النظام بنفسك. هل متاح لحضرتك دقيقة للاطلاع عليه؟`;

  // 4. Booking & Lead Capture System (Clinics & Real Estate)
  const bookingText = `مرحباً بحضرتك يا فندم، بتواصل مع إدارة ${name}.

أنا ${devTitle}، بنساعد المؤسسات والعيادات الرائدة في ${city} في رقمنة وأتمتة استقبال العملاء:
• موقع احترافي مجهز بنظام حجز مواعيد إلكتروني منظم.
• إشعارات فورية عبر واتساب لتأكيد المواعيد وتذكير العملاء لتقليل التخلف عن الحضور.
• صفحة مخصصة لعرض التخصصات وسوابق الأعمال وتقييمات العملاء.

هل تحب حضرتك أشارك معك نموذجاً لحلول الحجز والمتابعة الرقمية التي نفذناها لمشاريع مماثلة؟`;

  const templates: PitchTemplate[] = [
    {
      id: 'NEW_WEBSITE',
      title: 'إنشاء موقع رسمي جديد',
      description: 'مثالي للأنشطة التي لا تمتلك موقعاً وتريد الظهور في جوجل وبناء ثقة العملاء.',
      text: newWebsiteText,
    },
    {
      id: 'REDESIGN',
      title: 'تطوير وتسريع الموقع الحالي',
      description: 'مثالي للأنشطة التي لديها موقع قديم أو بطيء يحتاج توافقاً مع الموبايل والـ SEO.',
      text: redesignText,
    },
    {
      id: 'ECOMMERCE_MENU',
      title: 'قائمة تفاعلية وطلبات أونلاين',
      description: 'مخصص للمطاعم والكافيهات ومحلات التجزئة لاستقبال الطلبات وتوفير العمولات.',
      text: ecommerceText,
    },
    {
      id: 'BOOKING_SYSTEM',
      title: 'نظام حجز وإدارة مواعيد',
      description: 'مخصص للعيادات والمراكز الطبية والمكاتب الهندسية والعقارية.',
      text: bookingText,
    },
  ];

  // Determine recommendation
  let recommendedId = 'NEW_WEBSITE';
  if (!hasNoWebsite) {
    recommendedId = 'REDESIGN';
  } else if (isRestaurant) {
    recommendedId = 'ECOMMERCE_MENU';
  } else if (isClinic) {
    recommendedId = 'BOOKING_SYSTEM';
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
