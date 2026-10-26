import { PrismaClient, Prisma, MatchingRuleCategory } from '@prisma/client';
import { hashPassword } from './auth';
import { DEFAULT_SCORING_RULES } from './scoring-engine';
import { DEFAULT_MATCHING_CONFIG, DEFAULT_MATCHING_RULES } from './matching/rules';
import { DEFAULT_PLANS } from './payment/provider';
import { RawLeadInput } from './validator';
import { runIngestionPipeline } from './collectors';

export const DEMO_CREDENTIALS = {
  admin: {
    email: 'admin@leadforge.eg',
    password: 'Admin@12345',
    name: 'م. طارق المنشاوي (مدير النظام)',
  },
  developer: {
    email: 'dev@leadforge.eg',
    password: 'Dev@12345',
    name: 'م. عمر عبد الرحمن (مطور ويب)',
  },
};

export const SEED_BUSINESSES: RawLeadInput[] = [
  // --- DENTAL CLINICS (عيادات الأسنان) ---
  {
    name: 'عيادة دار الأسنان التخصصي - Dar Dental Clinic',
    category: 'Dental',
    city: 'القاهرة',
    area: 'مدينة نصر',
    address: '42 شارع مكرم عبيد، مدينة نصر',
    phone: '01002345101',
    email: 'contact@dardental-nasr.eg',
    website: '',
    facebook: 'https://facebook.com/dardentalclinic.eg',
    instagram: 'https://instagram.com/dardentalclinic.eg',
    rating: 4.8,
    reviewCount: 320,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Google Business Profile Export',
  },
  {
    name: 'مركز سمايل كير لطب وتجميل الأسنان',
    category: 'Dental',
    city: 'القاهرة',
    area: 'مصر الجديدة',
    address: '18 شارع الحجاز، مصر الجديدة',
    phone: '01002345102',
    website: '',
    facebook: 'https://facebook.com/smilecare.heliopolis',
    instagram: 'https://instagram.com/smilecare.heliopolis',
    rating: 4.7,
    reviewCount: 245,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'عيادات وايت بيرل للأسنان - White Pearl Dental',
    category: 'Dental',
    city: 'القاهرة الجديدة',
    area: 'التجمع الخامس',
    address: 'شارع التسعين الشمالي، مول كايرو ميديكال، التجمع الخامس',
    phone: '01002345103',
    email: 'info@whitepearl-eg.com',
    website: 'http://old-whitepearl-dental.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/whitepearldental.newcairo',
    instagram: 'https://instagram.com/whitepearldental.newcairo',
    rating: 4.9,
    reviewCount: 410,
    branchCount: 3,
    leadType: 'EXCLUSIVE',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'مركز د. شريف الجندي لزراعة وتقويم الأسنان',
    category: 'Dental',
    city: 'الجيزة',
    area: 'المهندسين',
    address: '55 شارع جامعة الدول العربية، المهندسين',
    phone: '01002345104',
    website: '',
    facebook: 'https://facebook.com/drsherifdental.eg',
    instagram: 'https://instagram.com/drsherifdental.eg',
    rating: 4.6,
    reviewCount: 185,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'عيادة زايد رويال دينتال - Zayed Royal Dental',
    category: 'Dental',
    city: 'الشيخ زايد',
    area: 'أركان',
    address: 'ميديكال بارك بجوار أركان بلازا، الشيخ زايد',
    phone: '01002345105',
    email: 'booking@zayedroyaldental.eg',
    website: '',
    facebook: 'https://facebook.com/zayedroyaldental',
    instagram: 'https://instagram.com/zayedroyaldental',
    rating: 4.9,
    reviewCount: 290,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Google Business Profile Export',
  },
  {
    name: 'عيادات النخبة لطب الأسنان - Elite Dental',
    category: 'Dental',
    city: 'الإسكندرية',
    area: 'سموحة',
    address: '12 ميدان فيكتور عمانويل، سموحة',
    phone: '01223456106',
    website: '',
    facebook: 'https://facebook.com/elitedental.alex',
    instagram: 'https://instagram.com/elitedental.alex',
    rating: 4.7,
    reviewCount: 160,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Egypt Open Commercial Registry Dataset',
  },
  {
    name: 'مركز الدلتا لطب الأسنان الرقمي',
    category: 'Dental',
    city: 'المنصورة',
    area: 'حي الجامعة',
    address: 'شارع جيهان أمام بوابة الجامعة، المنصورة',
    phone: '01065432107',
    website: 'http://legacy-deltadental-eg.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/deltadental.mansoura',
    rating: 4.5,
    reviewCount: 95,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'CSV Import',
  },

  // --- MEDICAL CENTERS (المراكز الطبية والعيادات) ---
  {
    name: 'مركز القاهرة التخصصي للعلاج الطبيعي والتأهيل',
    category: 'Medical',
    city: 'القاهرة',
    area: 'المعادي',
    address: 'شارع 9، ثكنات المعادي',
    phone: '01002345108',
    email: 'care@cairophysio-maadi.eg',
    website: '',
    facebook: 'https://facebook.com/cairophysio.maadi',
    instagram: 'https://instagram.com/cairophysio.maadi',
    rating: 4.8,
    reviewCount: 275,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'عيادات الشروق للعيون والليزك',
    category: 'Medical',
    city: 'الجيزة',
    area: 'الدقي',
    address: '90 شارع التحرير، الدقي',
    phone: '01112345109',
    website: 'http://old-shoroukeyes.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/shoroukeyes.dokki',
    instagram: 'https://instagram.com/shoroukeyes.dokki',
    rating: 4.6,
    reviewCount: 340,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'مركز الحياة كلينك للجلدية والليزر',
    category: 'Medical',
    city: '6 أكتوبر',
    area: 'المحور المركزي',
    address: 'برج الأطباء، ميدان الحصري، 6 أكتوبر',
    phone: '01002345110',
    website: '',
    facebook: 'https://facebook.com/alhayatclinic.october',
    instagram: 'https://instagram.com/alhayatclinic.october',
    rating: 4.7,
    reviewCount: 198,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'مختبرات الصفوة للتحاليل الطبية',
    category: 'Medical',
    city: 'طنطا',
    area: 'شارع البحر',
    address: 'شارع البحر الرئيسي، طنطا',
    phone: '01223456111',
    email: 'info@alsafwa-labs.com',
    website: 'https://alsafwa-labs.com',
    websiteStatus: 'HAS_WEBSITE',
    facebook: 'https://facebook.com/alsafwalabs.tanta',
    rating: 4.4,
    reviewCount: 88,
    branchCount: 3,
    leadType: 'SHARED',
    source: 'Public Domain & Website Registry',
  },
  {
    name: 'مركز دار الشفاء لأمراض القلب والأوعية الدموية',
    category: 'Medical',
    city: 'الإسكندرية',
    area: 'رشدي',
    address: 'طريق الحرية، رشدي، الإسكندرية',
    phone: '01002345112',
    website: '',
    facebook: 'https://facebook.com/darelshifa.cardio',
    rating: 4.8,
    reviewCount: 145,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'عيادات د. نهى الكيلاني للتغذية العلاجية',
    category: 'Medical',
    city: 'القاهرة',
    area: 'الزمالك',
    address: '14 شارع البرازيل، الزمالك',
    phone: '01002345113',
    website: '',
    facebook: 'https://facebook.com/drnoha.nutrition',
    instagram: 'https://instagram.com/drnoha.nutrition',
    rating: 4.9,
    reviewCount: 420,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Google Business Profile Export',
  },

  // --- RESTAURANTS & CAFES (المطاعم والكافيهات) ---
  {
    name: 'مطعم ومشويات قصر الكبابجي الأصلي',
    category: 'Restaurant',
    city: 'القاهرة',
    area: 'مصر الجديدة',
    address: 'شارع الميرغني، مصر الجديدة',
    phone: '01002345114',
    website: '',
    facebook: 'https://facebook.com/kasrelkababgy.heliopolis',
    instagram: 'https://instagram.com/kasrelkababgy.heliopolis',
    rating: 4.6,
    reviewCount: 840,
    branchCount: 3,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'كافيه ومحمصة بن السرايا - Saraya Roastery',
    category: 'Restaurant',
    city: 'الجيزة',
    area: 'الدقي',
    address: '22 شارع مصدق، الدقي',
    phone: '01002345115',
    email: 'orders@sarayaroastery.eg',
    website: '',
    facebook: 'https://facebook.com/sarayaroastery',
    instagram: 'https://instagram.com/sarayaroastery',
    rating: 4.7,
    reviewCount: 310,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'مطعم بحريات المرسى للمأكولات البحرية',
    category: 'Restaurant',
    city: 'الإسكندرية',
    area: 'ستانلي',
    address: 'كورنيش ستانلي، الإسكندرية',
    phone: '01223456116',
    website: 'http://old-elmarsa-seafood.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/elmarsaseafood.alex',
    instagram: 'https://instagram.com/elmarsaseafood.alex',
    rating: 4.5,
    reviewCount: 620,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'سلسلة مطاعم شاورما السلطان الدمشقي',
    category: 'Restaurant',
    city: 'القاهرة',
    area: 'مدينة نصر',
    address: 'شارع الطيران، مدينة نصر',
    phone: '01002345117',
    website: '',
    facebook: 'https://facebook.com/sultanshawerma.eg',
    instagram: 'https://instagram.com/sultanshawerma.eg',
    rating: 4.4,
    reviewCount: 510,
    branchCount: 4,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'بيسترو أوليف جاردن - Olive Garden Bistro',
    category: 'Restaurant',
    city: 'الشيخ زايد',
    area: 'الحي الرابع',
    address: 'مول الجزيرة بلازا، الشيخ زايد',
    phone: '01002345118',
    website: '',
    facebook: 'https://facebook.com/olivegarden.zayed',
    instagram: 'https://instagram.com/olivegarden.zayed',
    rating: 4.8,
    reviewCount: 270,
    branchCount: 1,
    leadType: 'EXCLUSIVE',
    source: 'Google Business Profile Export',
  },
  {
    name: 'حلواني قصر الشوكولاتة والباتيسير',
    category: 'Restaurant',
    city: 'المنصورة',
    area: 'المشاية السفلية',
    address: 'شارع المشاية السفلية، المنصورة',
    phone: '01002345119',
    website: '',
    facebook: 'https://facebook.com/chocopallace.mansoura',
    instagram: 'https://instagram.com/chocopallace.mansoura',
    rating: 4.7,
    reviewCount: 390,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'CSV Import',
  },

  // --- REAL ESTATE (العقارات والمقاولات) ---
  {
    name: 'شركة البنيان للتطوير العقاري والاستثمار',
    category: 'Real Estate',
    city: 'القاهرة الجديدة',
    area: 'التجمع الخامس',
    address: 'حي البنفسج، التجمع الخامس',
    phone: '01002345120',
    email: 'sales@albonyan-developments.eg',
    website: '',
    facebook: 'https://facebook.com/albonyandevelopments',
    instagram: 'https://instagram.com/albonyandevelopments',
    rating: 4.8,
    reviewCount: 175,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Egypt Open Commercial Registry Dataset',
  },
  {
    name: 'مجموعة الكنانة للمقاولات والتسويق العقاري',
    category: 'Real Estate',
    city: 'القاهرة',
    area: 'مدينة نصر',
    address: 'شارع النصر، مدينة نصر',
    phone: '01002345121',
    email: 'info@alkenana-realestate.com',
    website: 'http://old-alkenana-realestate.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/alkenanarealestate',
    instagram: 'https://instagram.com/alkenanarealestate',
    rating: 4.5,
    reviewCount: 130,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'شركة هورايزون لإدارة المشروعات العقارية',
    category: 'Real Estate',
    city: 'الشيخ زايد',
    area: 'بيفرلي هيلز',
    address: 'البوليفارد التجاري، الشيخ زايد',
    phone: '01002345122',
    website: '',
    facebook: 'https://facebook.com/horizonproperties.eg',
    instagram: 'https://instagram.com/horizonproperties.eg',
    rating: 4.7,
    reviewCount: 92,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'دار المعمار للتشطيبات والديكور الهندسي',
    category: 'Real Estate',
    city: 'الجيزة',
    area: 'المهندسين',
    address: 'شارع البطل أحمد عبد العزيز، المهندسين',
    phone: '01002345123',
    website: '',
    facebook: 'https://facebook.com/darelmemar.design',
    instagram: 'https://instagram.com/darelmemar.design',
    rating: 4.9,
    reviewCount: 210,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'شركة البحر الأحمر للاستثمار السياحي والعقاري',
    category: 'Real Estate',
    city: 'الغردقة',
    area: 'الممشى السياحي',
    address: 'الممشى السياحي، الغردقة',
    phone: '01002345124',
    email: 'invest@redsearealestate.eg',
    website: 'http://legacy-redsea-homes.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/redseahomes.hurghada',
    rating: 4.6,
    reviewCount: 84,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'شركة تاج مصر للتسويق العقاري',
    category: 'Real Estate',
    city: '6 أكتوبر',
    area: 'الحي المتميز',
    address: 'المحور المركزي، 6 أكتوبر',
    phone: '01002345125',
    website: 'https://tajmisr-modern.eg',
    websiteStatus: 'HAS_WEBSITE',
    facebook: 'https://facebook.com/tajmisr.october',
    rating: 4.3,
    reviewCount: 45,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Public Domain & Website Registry',
  },

  // --- EDUCATION & ACADEMIES (التعليم والأكاديميات) ---
  {
    name: 'أكاديمية المستقبل الدولية للغات والبرمجة',
    category: 'Education',
    city: 'القاهرة',
    area: 'مدينة نصر',
    address: 'شارع مصطفى النحاس، مدينة نصر',
    phone: '01002345126',
    email: 'admissions@futureacademy-eg.org',
    website: '',
    facebook: 'https://facebook.com/futureacademy.nasrcity',
    instagram: 'https://instagram.com/futureacademy.nasrcity',
    rating: 4.8,
    reviewCount: 330,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'مركز كامبريدج مصر للتدريب المهني',
    category: 'Education',
    city: 'الجيزة',
    area: 'الدقي',
    address: 'شارع محيي الدين أبو العز، الدقي',
    phone: '01002345127',
    website: 'http://old-cambridge-training-eg.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/cambridgetraining.dokki',
    instagram: 'https://instagram.com/cambridgetraining.dokki',
    rating: 4.6,
    reviewCount: 190,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'حضانات ومدارس خطوات الطفولة - Little Steps Preschool',
    category: 'Education',
    city: 'القاهرة الجديدة',
    area: 'الرحاب',
    address: 'الرحاب، المرحلة الرابعة، القاهرة الجديدة',
    phone: '01002345128',
    website: '',
    facebook: 'https://facebook.com/littlesteps.rehab',
    instagram: 'https://instagram.com/littlesteps.rehab',
    rating: 4.9,
    reviewCount: 155,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Google Business Profile Export',
  },
  {
    name: 'أكاديمية الإسكندرية للعلوم الإدارية والمحاسبية',
    category: 'Education',
    city: 'الإسكندرية',
    area: 'سيدي جابر',
    address: 'شارع المشير، سيدي جابر',
    phone: '01223456129',
    email: 'info@alexmanagement-academy.eg',
    website: '',
    facebook: 'https://facebook.com/alexmanagement.academy',
    rating: 4.5,
    reviewCount: 112,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'CSV Import',
  },
  {
    name: 'مركز إبداع لتعليم الجرافيك والموشن جرافيك',
    category: 'Education',
    city: 'المنصورة',
    area: 'توريل',
    address: 'شارع قناة السويس، توريل، المنصورة',
    phone: '01002345130',
    website: '',
    facebook: 'https://facebook.com/ebdaa.mansoura',
    instagram: 'https://instagram.com/ebdaa.mansoura',
    rating: 4.7,
    reviewCount: 225,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },

  // --- RETAIL & STORES (التجارة والمحلات التجارية) ---
  {
    name: 'معارض النور للأثاث المودرن والمفروشات',
    category: 'Retail',
    city: 'القاهرة',
    area: 'مدينة نصر',
    address: 'شارع حسنين هيكل، مدينة نصر',
    phone: '01002345131',
    website: '',
    facebook: 'https://facebook.com/alnoorfurniture.eg',
    instagram: 'https://instagram.com/alnoorfurniture.eg',
    rating: 4.7,
    reviewCount: 415,
    branchCount: 3,
    leadType: 'EXCLUSIVE',
    source: 'Google Business Profile Export',
  },
  {
    name: 'متجر تك زون للإلكترونيات واللابتوب - TechZone Store',
    category: 'Retail',
    city: 'القاهرة',
    area: 'مصر الجديدة',
    address: 'سوق العصر، الخليفة المأمون، مصر الجديدة',
    phone: '01002345132',
    email: 'sales@techzone-heliopolis.eg',
    website: 'http://old-techzone-egypt.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/techzone.heliopolis',
    instagram: 'https://instagram.com/techzone.heliopolis',
    rating: 4.6,
    reviewCount: 280,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'بيت الأناقة للأزياء والملابس الجاهزة',
    category: 'Retail',
    city: 'الجيزة',
    area: 'المهندسين',
    address: 'شارع شهاب، المهندسين',
    phone: '01002345133',
    website: '',
    facebook: 'https://facebook.com/elegancehouse.mohandessin',
    instagram: 'https://instagram.com/elegancehouse.mohandessin',
    rating: 4.5,
    reviewCount: 190,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'محمصة وعطارة الحرمين الشريفين',
    category: 'Retail',
    city: 'الزقازيق',
    area: 'القومية',
    address: 'شارع القومية الرئيسي، الزقازيق',
    phone: '01002345134',
    website: '',
    facebook: 'https://facebook.com/alharamain.zagazig',
    rating: 4.6,
    reviewCount: 140,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'CSV Import',
  },
  {
    name: 'معرض السيراميك والبورسلين الملكي',
    category: 'Retail',
    city: 'العبور',
    area: 'الحي الأول',
    address: 'المحور الرئيسي، مدينة العبور',
    phone: '01002345135',
    website: '',
    facebook: 'https://facebook.com/royalceramics.obour',
    instagram: 'https://instagram.com/royalceramics.obour',
    rating: 4.4,
    reviewCount: 95,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Egypt Open Commercial Registry Dataset',
  },
  {
    name: 'بصريات النظرة الثاقبة للنظارات والعدسات',
    category: 'Retail',
    city: 'بورسعيد',
    area: 'الشرق',
    address: 'شارع الجمهورية، حي الشرق، بورسعيد',
    phone: '01223456136',
    website: 'https://alnazra-optics.eg',
    websiteStatus: 'HAS_WEBSITE',
    facebook: 'https://facebook.com/alnazraoptics.portsaid',
    rating: 4.2,
    reviewCount: 30,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Public Domain & Website Registry',
  },

  // --- BEAUTY & SPA (مراكز التجميل والعناية) ---
  {
    name: 'مركز لافندر بيوتي آند سبا - Lavender Beauty Lounge',
    category: 'Beauty',
    city: 'القاهرة الجديدة',
    area: 'التجمع الخامس',
    address: 'كونكورد بلازا، شارع التسعين الجنوبي، التجمع الخامس',
    phone: '01002345137',
    email: 'hello@lavenderbeauty.eg',
    website: '',
    facebook: 'https://facebook.com/lavenderbeauty.newcairo',
    instagram: 'https://instagram.com/lavenderbeauty.newcairo',
    rating: 4.9,
    reviewCount: 360,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Google Business Profile Export',
  },
  {
    name: 'بيوتي سنتر جلامور للعناية بالبشرة والشعر',
    category: 'Beauty',
    city: 'القاهرة',
    area: 'مصر الجديدة',
    address: 'شارع الثورة، مصر الجديدة',
    phone: '01002345138',
    website: '',
    facebook: 'https://facebook.com/glamourbeauty.heliopolis',
    instagram: 'https://instagram.com/glamourbeauty.heliopolis',
    rating: 4.7,
    reviewCount: 215,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'مركز روز جولد للتجميل والعرائس',
    category: 'Beauty',
    city: 'الإسكندرية',
    area: 'لوران',
    address: 'شارع شعراوي، لوران، الإسكندرية',
    phone: '01223456139',
    website: 'http://old-rosegold-salon.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/rosegold.alex',
    instagram: 'https://instagram.com/rosegold.alex',
    rating: 4.6,
    reviewCount: 180,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'نادي وصالة جيم تيتانيوم فيتنس - Titanium Gym & Spa',
    category: 'Beauty',
    city: 'الجيزة',
    area: 'حدائق الأهرام',
    address: 'البوابة الأولى، حدائق الأهرام، الجيزة',
    phone: '01002345140',
    website: '',
    facebook: 'https://facebook.com/titaniumgym.giza',
    instagram: 'https://instagram.com/titaniumgym.giza',
    rating: 4.5,
    reviewCount: 250,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },

  // --- AUTOMOTIVE (السيارات وخدمات الصيانة) ---
  {
    name: 'مركز أوتو ماستر لصيانة السيارات الأوروبية',
    category: 'Automotive',
    city: 'القاهرة',
    area: 'الحرفيين',
    address: 'محور جوزيف تيتو، النزهة الجديدة',
    phone: '01002345141',
    email: 'service@automaster-cairo.eg',
    website: '',
    facebook: 'https://facebook.com/automaster.cairo',
    instagram: 'https://instagram.com/automaster.cairo',
    rating: 4.8,
    reviewCount: 310,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Google Business Profile Export',
  },
  {
    name: 'معرض الطارق لتجارة واستيراد السيارات الحديثة',
    category: 'Automotive',
    city: 'القاهرة',
    area: 'مدينة نصر',
    address: 'شارع الطيران، مدينة نصر',
    phone: '01002345142',
    website: 'http://old-altarek-motors.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/altarekmotors.eg',
    instagram: 'https://instagram.com/altarekmotors.eg',
    rating: 4.6,
    reviewCount: 195,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'مركز برو شيلد لحماية طلاء السيارات والنانو سيراميك',
    category: 'Automotive',
    city: 'الشيخ زايد',
    area: 'الحي الأول',
    address: 'مول المعز، الشيخ زايد',
    phone: '01002345143',
    website: '',
    facebook: 'https://facebook.com/proshield.zayed',
    instagram: 'https://instagram.com/proshield.zayed',
    rating: 4.9,
    reviewCount: 165,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'مركز الهندسية لقطع غيار وإطارات السيارات',
    category: 'Automotive',
    city: 'طنطا',
    area: 'الاستاد',
    address: 'طريق الاستاد، طنطا',
    phone: '01223456144',
    website: '',
    facebook: 'https://facebook.com/handasiaauto.tanta',
    rating: 4.4,
    reviewCount: 72,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'CSV Import',
  },

  // --- OTHER BUSINESSES & COLD/WARM LEADS FOR SCORE DIVERSITY ---
  {
    name: 'مكتب المستشار القانوني للمحاماة وتأسيس الشركات',
    category: 'Other',
    city: 'القاهرة',
    area: 'وسط البلد',
    address: 'شارع قصر النيل، وسط البلد، القاهرة',
    phone: '01002345145',
    email: 'legal@almustashar-law.eg',
    website: '',
    facebook: 'https://facebook.com/almustasharlaw.cairo',
    rating: 4.8,
    reviewCount: 120,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Egypt Open Commercial Registry Dataset',
  },
  {
    name: 'شركة يونيفرسال للشحن والخدمات اللوجستية',
    category: 'Other',
    city: 'العاشر من رمضان',
    area: 'الأردنية',
    address: 'المجاورة الأولى، العاشر من رمضان',
    phone: '01002345146',
    email: 'ops@universal-logistics-eg.com',
    website: 'http://old-universal-logistics.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/universallogistics.eg',
    rating: 4.5,
    reviewCount: 140,
    branchCount: 3,
    leadType: 'SHARED',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'شركة دلتا باك للتغليف والصناعات الورقية',
    category: 'Other',
    city: 'بنها',
    area: 'الفلل',
    address: 'منطقة الفلل، بنها',
    phone: '01002345147',
    website: '',
    facebook: 'https://facebook.com/deltapack.banha',
    rating: 4.3,
    reviewCount: 55,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'CSV Import',
  },
  {
    name: 'شركة الصعيد للمستلزمات الزراعية والري الحديث',
    category: 'Other',
    city: 'أسيوط',
    area: 'شارع الجمهورية',
    address: 'شارع الجمهورية، أسيوط',
    phone: '01002345148',
    website: '',
    facebook: 'https://facebook.com/upperagro.assiut',
    rating: 4.6,
    reviewCount: 80,
    branchCount: 2,
    leadType: 'SHARED',
    source: 'Egypt Open Commercial Registry Dataset',
  },
  {
    name: 'مطبعة الفجر الحديث للدعاية والإعلان',
    category: 'Other',
    city: 'المحلة الكبرى',
    area: 'السبع بنات',
    address: 'منطقة السبع بنات، المحلة الكبرى',
    phone: '01002345149',
    website: 'https://alfajr-print.com',
    websiteStatus: 'HAS_WEBSITE',
    rating: 4.0,
    reviewCount: 18,
    branchCount: 1,
    isRecentlyActive: false,
    leadType: 'SHARED',
    source: 'Public Domain & Website Registry',
  },
  {
    name: 'ورشة النجاح للألوميتال والواجهات الزجاجية',
    category: 'Real Estate',
    city: 'حلوان',
    area: 'حلوان',
    address: 'شارع راغب، حلوان',
    phone: '01002345150',
    website: 'https://elnagah-alumital.com',
    websiteStatus: 'HAS_WEBSITE',
    rating: 3.9,
    reviewCount: 12,
    branchCount: 1,
    isRecentlyActive: false,
    leadType: 'SHARED',
    source: 'Manual Entry',
  },
  {
    name: 'عيادة د. هاني فوزي للأسنان',
    category: 'Dental',
    city: 'القاهرة',
    area: 'شبرا',
    address: 'شارع شبرا الرئيسي، القاهرة',
    phone: '01002345151',
    website: '',
    facebook: 'https://facebook.com/drhanydental.shubra',
    rating: 4.4,
    reviewCount: 38,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'مطعم واحة الفلاح للمأكولات الريفية',
    category: 'Restaurant',
    city: 'الجيزة',
    area: 'الهرم',
    address: 'شارع الهرم، الجيزة',
    phone: '01002345152',
    website: '',
    facebook: 'https://facebook.com/wahetelfalah.haram',
    rating: 4.3,
    reviewCount: 44,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'CSV Import',
  },
  {
    name: 'مركز رؤية للبصريات والعدسات اللاصقة',
    category: 'Medical',
    city: 'القاهرة',
    area: 'المقطم',
    address: 'ميدان النافورة، المقطم، القاهرة',
    phone: '01002345153',
    website: 'https://roya-optics-modern.eg',
    websiteStatus: 'HAS_WEBSITE',
    rating: 4.1,
    reviewCount: 15,
    branchCount: 1,
    isRecentlyActive: false,
    leadType: 'SHARED',
    source: 'Public Domain & Website Registry',
  },
  {
    name: 'شركة النيل الأزرق للسياحة وحجز الفنادق',
    category: 'Other',
    city: 'القاهرة',
    area: 'المعادي',
    address: 'شارع النصر، المعادي الجديدة',
    phone: '01002345154',
    email: 'booking@bluenile-travel.eg',
    website: 'http://old-bluenile-travel.com',
    websiteStatus: 'POOR_WEBSITE',
    facebook: 'https://facebook.com/blueniletravel.eg',
    instagram: 'https://instagram.com/blueniletravel.eg',
    rating: 4.7,
    reviewCount: 165,
    branchCount: 2,
    leadType: 'EXCLUSIVE',
    source: 'Egypt Business Directory Feed',
  },
  {
    name: 'عيادة كيدز سمايل لطب أسنان الأطفال',
    category: 'Dental',
    city: 'الجيزة',
    area: 'العجوزة',
    address: 'شارع النيل، العجوزة، الجيزة',
    phone: '01002345155',
    website: '',
    facebook: 'https://facebook.com/kidssmile.giza',
    instagram: 'https://instagram.com/kidssmile.giza',
    rating: 4.9,
    reviewCount: 260,
    branchCount: 1,
    leadType: 'SHARED',
    source: 'Google Business Profile Export',
  },
  {
    name: 'مركز النور التخصصي للعلاج الطبيعي (بيانات قيد الاستكمال)',
    category: 'Medical',
    city: 'القاهرة',
    area: 'حلوان',
    address: 'شارع محمد سيد أحمد، حلوان',
    phone: '01002345156',
    websiteStatus: 'UNKNOWN',
    facebook: 'https://facebook.com/alnoor.physio.helwan',
    leadType: 'SHARED',
    source: 'CSV Import',
  },
  {
    name: 'مكتب الأفق للاستشارات الهندسية الحديثة',
    category: 'Real Estate',
    city: 'السويس',
    area: 'الأربعين',
    address: 'شارع الجيش، السويس',
    phone: '01002345157',
    website: 'https://alofoq-engineering.eg',
    websiteStatus: 'HAS_WEBSITE',
    rating: 4.0,
    reviewCount: 8,
    branchCount: 1,
    isRecentlyActive: false,
    leadType: 'SHARED',
    source: 'Public Domain & Website Registry',
  },
  {
    name: 'مجموعة عيادات كليوباترا التخصصية لتجميل الأسنان والجلدية',
    category: 'Dental',
    city: 'القاهرة الجديدة',
    area: 'التجمع الخامس',
    address: 'شارع التسعين الجنوبي، التجمع الخامس',
    phone: '01002345158',
    email: 'vip@cleopatra-clinics.eg',
    website: '',
    websiteStatus: 'NO_WEBSITE',
    facebook: 'https://facebook.com/cleopatraclinics.newcairo',
    instagram: 'https://instagram.com/cleopatraclinics.newcairo',
    rating: 4.9,
    reviewCount: 480,
    branchCount: 4,
    leadType: 'EXCLUSIVE',
    source: 'Google Business Profile Export',
  },
];

export async function seedDatabase(
  prisma: PrismaClient,
  options?: { env?: Record<string, string | undefined> }
) {
  const { assertSeedAllowedInEnvironment } = await import('./production/database-ops');
  assertSeedAllowedInEnvironment(options?.env ?? process.env);

  // Check if already seeded
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    const claimsWithoutEngagement = await prisma.leadClaim.findMany({
      where: { engagement: null },
    });
    for (const c of claimsWithoutEngagement) {
      const mappedStatus = c.pipelineStatus === 'NEW' ? 'CLAIMED' : c.pipelineStatus;
      const isTerm = ['WON', 'LOST', 'NOT_INTERESTED', 'INVALID'].includes(mappedStatus);
      await prisma.leadEngagement.upsert({
        where: {
          leadId_developerId: {
            leadId: c.leadId,
            developerId: c.userId,
          },
        },
        update: {},
        create: {
          leadId: c.leadId,
          developerId: c.userId,
          claimId: c.id,
          currentStatus: mappedStatus,
          claimedAt: c.claimedAt,
          lastContactedAt: c.lastContactedAt,
          isTerminal: isTerm,
          finalOutcome: isTerm ? mappedStatus : null,
          wonAt: mappedStatus === 'WON' ? c.updatedAt : null,
          lostAt: mappedStatus === 'LOST' ? c.updatedAt : null,
          notInterestedAt: mappedStatus === 'NOT_INTERESTED' ? c.updatedAt : null,
          invalidAt: mappedStatus === 'INVALID' ? c.updatedAt : null,
          closedAt: isTerm ? c.updatedAt : null,
        },
      });
    }

    const smileCareLead = await prisma.lead.findFirst({
      where: { businessName: { contains: 'مركز سمايل كير لطب وتجميل الأسنان' } },
      include: { engagements: true },
    });
    if (smileCareLead && smileCareLead.engagements.length < 3) {
      const secondDev = await prisma.user.findUnique({ where: { email: 'ahmed.web@leadforge.eg' } });
      const thirdDev = await prisma.user.findUnique({ where: { email: 'sara.agency@leadforge.eg' } });
      const now = new Date();
      if (secondDev && !smileCareLead.engagements.some((e) => e.developerId === secondDev.id)) {
        const sc2 = await prisma.leadClaim.upsert({
          where: { leadId_userId: { leadId: smileCareLead.id, userId: secondDev.id } },
          update: {},
          create: {
            leadId: smileCareLead.id,
            userId: secondDev.id,
            developerId: secondDev.id,
            status: 'ACTIVE',
            accessType: 'SHARED',
            pipelineStatus: 'NEW',
            creditsSpent: 1,
            creditsCharged: 1,
            creditsRefunded: 0,
            creditCostReason: 'SHARED_LEAD',
            exclusiveClaim: false,
            accessGranted: true,
            accessGrantedAt: now,
            notes: 'تم الحصول على الفرصة وجارٍ التحضير للتواصل الهاتفي.',
          },
        });
        await prisma.leadEngagement.upsert({
          where: { leadId_developerId: { leadId: smileCareLead.id, developerId: secondDev.id } },
          update: {},
          create: {
            leadId: smileCareLead.id,
            developerId: secondDev.id,
            claimId: sc2.id,
            currentStatus: 'CLAIMED',
            isTerminal: false,
            claimedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
          },
        });
      }
      if (thirdDev && !smileCareLead.engagements.some((e) => e.developerId === thirdDev.id)) {
        const sc3 = await prisma.leadClaim.upsert({
          where: { leadId_userId: { leadId: smileCareLead.id, userId: thirdDev.id } },
          update: {},
          create: {
            leadId: smileCareLead.id,
            userId: thirdDev.id,
            developerId: thirdDev.id,
            status: 'ACTIVE',
            accessType: 'SHARED',
            pipelineStatus: 'NOT_INTERESTED',
            creditsSpent: 1,
            creditsCharged: 1,
            creditsRefunded: 0,
            creditCostReason: 'SHARED_LEAD',
            exclusiveClaim: false,
            accessGranted: true,
            accessGrantedAt: now,
            notes: 'العميل يفضل التعامل مع مطور فردي وليس وكالة في الوقت الحالي.',
            lastContactedAt: now,
          },
        });
        await prisma.leadEngagement.upsert({
          where: { leadId_developerId: { leadId: smileCareLead.id, developerId: thirdDev.id } },
          update: {},
          create: {
            leadId: smileCareLead.id,
            developerId: thirdDev.id,
            claimId: sc3.id,
            currentStatus: 'NOT_INTERESTED',
            isTerminal: true,
            closedAt: now,
            claimedAt: new Date(now.getTime() - 36 * 60 * 60 * 1000),
            firstContactedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            lastContactedAt: now,
            notInterestedAt: now,
            finalOutcome: 'NOT_INTERESTED',
            outcomeReasonCode: 'NOT_INTERESTED',
            outcomeReasonNote: 'العميل يفضل التعامل مع مطور فردي وليس وكالة.',
            outcomeNote: 'العميل يفضل التعامل مع مطور فردي وليس وكالة.',
          },
        });
      }
    }

    await ensurePhase7AndRefundSeedData(prisma);
    return { alreadySeeded: true };
  }

  // 1. Freshness Config & Scoring Config
  await prisma.freshnessConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      freshMaxDays: 7,
      recentMaxDays: 30,
      needsVerifyMaxDays: 90,
    },
  });

  await prisma.scoringConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      currentVersion: 'v1',
      versionNumber: 1,
      coldMax: 49,
      warmMin: 50,
      warmMax: 69,
      hotMin: 70,
      hotMax: 84,
      premiumMin: 85,
      minScore: 0,
      maxScore: 100,
    },
  });

  // 2. Scoring Rules (10 default deterministic rules with Phase 1 metadata)
  for (const rule of DEFAULT_SCORING_RULES) {
    await prisma.scoringRule.upsert({
      where: { code: rule.code },
      update: {
        key: rule.key || rule.code,
        category: rule.category || 'GENERAL',
        ruleGroup: rule.ruleGroup || null,
        points: rule.points ?? rule.weight,
        weight: rule.weight,
        priority: rule.priority ?? rule.sortOrder ?? 100,
        version: rule.version || 'v1',
      },
      create: {
        id: rule.id,
        code: rule.code,
        key: rule.key || rule.code,
        name: rule.name,
        nameEn: rule.nameEn,
        description: `قاعدة تقييم تلقائية: ${rule.name} (${rule.weight > 0 ? '+' : ''}${rule.weight})`,
        category: rule.category || 'GENERAL',
        ruleGroup: rule.ruleGroup || null,
        points: rule.points ?? rule.weight,
        weight: rule.weight,
        priority: rule.priority ?? rule.sortOrder ?? 100,
        version: rule.version || 'v1',
        enabled: rule.enabled,
        field: rule.field,
        operator: rule.operator,
        targetValue: rule.targetValue,
        conditions: {
          field: rule.field,
          operator: rule.operator,
          targetValue: rule.targetValue,
          ruleGroup: rule.ruleGroup || null,
        },
        sortOrder: rule.sortOrder || 0,
      },
    });
  }

  // 2b. Phase 4 Matching Config & Deterministic Matching Rules
  await prisma.matchingConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      currentVersion: DEFAULT_MATCHING_CONFIG.currentVersion,
      versionNumber: DEFAULT_MATCHING_CONFIG.versionNumber,
      serviceMatchMode: 'ALL_REQUIRED',
      unknownLocationPolicy: 'ALLOW_WITH_PENALTY',
      unknownBudgetPolicy: 'ALLOW_WITH_PENALTY',
      requiresVerificationPolicy: 'EXCLUDE',
      budgetHardRequirement: DEFAULT_MATCHING_CONFIG.budgetHardRequirement,
      requireActiveSubscription: DEFAULT_MATCHING_CONFIG.requireActiveSubscription,
      requireDeveloperVerified: DEFAULT_MATCHING_CONFIG.requireDeveloperVerified,
      minMatchStrength: DEFAULT_MATCHING_CONFIG.minMatchStrength,
      maxMatchStrength: DEFAULT_MATCHING_CONFIG.maxMatchStrength,
      unknownLocationPenalty: DEFAULT_MATCHING_CONFIG.unknownLocationPenalty,
      unknownBudgetPenalty: DEFAULT_MATCHING_CONFIG.unknownBudgetPenalty,
    },
  });

  for (const mRule of DEFAULT_MATCHING_RULES) {
    await prisma.matchingRule.upsert({
      where: { key: mRule.key },
      update: {},
      create: {
        key: mRule.key,
        name: mRule.name,
        nameEn: mRule.nameEn,
        description: mRule.description || null,
        category: mRule.category as MatchingRuleCategory,
        ruleGroup: mRule.ruleGroup || null,
        points: mRule.points,
        priority: mRule.priority,
        enabled: mRule.enabled,
        version: mRule.version,
        condition: mRule.condition as Prisma.InputJsonValue,
      },
    });
  }

  // 3. Plans (Free, Starter, Pro, Business)
  const createdPlans: Record<string, string> = {};
  for (const planData of DEFAULT_PLANS) {
    const plan = await prisma.plan.upsert({
      where: { slug: planData.slug },
      update: {},
      create: planData,
    });
    createdPlans[plan.slug] = plan.id;
  }

  // 4. Users (1 Admin + 5 Developers)
  const adminHash = await hashPassword(DEMO_CREDENTIALS.admin.password);
  const devHash = await hashPassword(DEMO_CREDENTIALS.developer.password);

  const adminUser = await prisma.user.create({
    data: {
      email: DEMO_CREDENTIALS.admin.email,
      passwordHash: adminHash,
      name: DEMO_CREDENTIALS.admin.name,
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: new Date(),
    },
  });

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const developersData = [
    {
      email: DEMO_CREDENTIALS.developer.email,
      name: DEMO_CREDENTIALS.developer.name,
      companyName: 'استوديو كود بلس لتطوير الويب',
      phone: '01099887766',
      bio: 'مطور مواقع وتطبيقات ويب متخصص في مواقع العيادات والشركات العقارية والمطاعم في القاهرة والجيزة.',
      services: ['Website Development', 'Booking & Clinic Systems', 'Website Redesign'],
      locations: ['القاهرة', 'القاهرة الجديدة', 'الجيزة', 'الشيخ زايد', '6 أكتوبر'],
      niches: ['Dental', 'Medical', 'Real Estate', 'Restaurant'],
      leadPreferences: ['NO_WEBSITE', 'POOR_WEBSITE'],
      minBudget: 8000,
      maxBudget: 60000,
      budgetRange: '8000-60000',
      leadType: 'BOTH',
      planSlug: 'pro',
      credits: 45,
      totalCreditsGranted: 50,
      creditsUsed: 5,
    },
    {
      email: 'ahmed.web@leadforge.eg',
      name: 'أحمد سامي',
      companyName: 'فريلانسر تطوير متاجر ومواقع',
      phone: '01122334455',
      bio: 'متخصص في تطوير المتاجر الإلكترونية ومواقع المطاعم والتجارة.',
      services: ['E-Commerce Development', 'Website Development'],
      locations: ['الإسكندرية', 'القاهرة'],
      niches: ['Retail', 'Restaurant', 'Beauty'],
      leadPreferences: ['NO_WEBSITE', 'POOR_WEBSITE'],
      minBudget: 6000,
      maxBudget: 35000,
      budgetRange: '6000-35000',
      leadType: 'SHARED',
      planSlug: 'starter',
      credits: 17,
      totalCreditsGranted: 20,
      creditsUsed: 3,
    },
    {
      email: 'sara.agency@leadforge.eg',
      name: 'سارة محمود',
      companyName: 'وكالة نيكست ديجيتال - Next Digital Agency',
      phone: '01233445566',
      bio: 'وكالة رقمية متكاملة لتطوير المواقع العقارية والتعليمية والطبية.',
      services: ['Website Development', 'Custom Web Applications', 'Website Redesign'],
      locations: ['القاهرة', 'القاهرة الجديدة', 'الشيخ زايد'],
      niches: ['Real Estate', 'Education', 'Medical', 'Dental'],
      leadPreferences: ['NO_WEBSITE', 'POOR_WEBSITE'],
      minBudget: 12000,
      maxBudget: 100000,
      budgetRange: '12000-100000',
      leadType: 'EXCLUSIVE',
      planSlug: 'business',
      credits: 92,
      totalCreditsGranted: 100,
      creditsUsed: 8,
    },
    {
      email: 'kareem.ecom@leadforge.eg',
      name: 'كريم عادل',
      companyName: 'دلتا ويب سوليوشنز',
      phone: '01055667788',
      bio: 'تطوير مواقع الشركات والعيادات في منطقة الدلتا والمنصورة وطنطا.',
      services: ['Website Development', 'Landing Pages'],
      locations: ['المنصورة', 'طنطا', 'الزقازيق'],
      niches: ['Dental', 'Medical', 'Education', 'Retail'],
      leadPreferences: ['NO_WEBSITE', 'POOR_WEBSITE'],
      minBudget: 5000,
      maxBudget: 25000,
      budgetRange: '5000-25000',
      leadType: 'BOTH',
      planSlug: 'starter',
      credits: 19,
      totalCreditsGranted: 20,
      creditsUsed: 1,
    },
    {
      email: 'nour.digital@leadforge.eg',
      name: 'نور الدين حسن',
      companyName: 'نور ستوديو لتصميم المواقع',
      phone: '01566778899',
      bio: 'مصمم ومطور واجهات ومواقع تعريفية.',
      services: ['Landing Pages', 'Website Development'],
      locations: ['القاهرة', 'الجيزة'],
      niches: ['Beauty', 'Automotive', 'Restaurant'],
      leadPreferences: ['NO_WEBSITE'],
      minBudget: 5000,
      maxBudget: 20000,
      budgetRange: '5000-20000',
      leadType: 'SHARED',
      planSlug: 'free',
      credits: 2,
      totalCreditsGranted: 3,
      creditsUsed: 1,
    },
  ];

  const createdDevs = [];
  for (const dev of developersData) {
    const u = await prisma.user.create({
      data: {
        email: dev.email,
        passwordHash: devHash,
        name: dev.name,
        role: 'DEVELOPER',
        status: 'ACTIVE',
        emailVerified: new Date(),
        developerProfile: {
          create: {
            companyName: dev.companyName,
            phone: dev.phone,
            bio: dev.bio,
            services: dev.services,
            locations: dev.locations,
            niches: dev.niches,
            leadPreferences: dev.leadPreferences,
            minBudget: dev.minBudget,
            maxBudget: dev.maxBudget,
            budgetRange: dev.budgetRange,
            leadType: dev.leadType,
          },
        },
        subscription: {
          create: {
            planId: createdPlans[dev.planSlug],
            status: 'ACTIVE',
            credits: dev.credits,
            totalCreditsGranted: dev.totalCreditsGranted,
            creditsUsed: dev.creditsUsed,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
      },
    });

    if (dev.planSlug !== 'free') {
      const planObj = DEFAULT_PLANS.find((p) => p.slug === dev.planSlug)!;
      await prisma.payment.create({
        data: {
          userId: u.id,
          planId: createdPlans[dev.planSlug],
          amountEgp: planObj.priceEgp,
          creditsGranted: planObj.monthlyCredits,
          provider: 'SANDBOX_LOCAL_PROVIDER',
          providerRef: `LF-SEED-${u.id.slice(-6).toUpperCase()}`,
          status: 'COMPLETED',
        },
      });
    }

    createdDevs.push(u);
  }

  // 5. Data Sources
  const sourcesData = [
    {
      name: 'Google Business Profile Export',
      type: 'GOOGLE_BUSINESS' as const,
      description: 'بيانات الأنشطة التجارية الموثقة والمستخرجة من ملفات Google Business في المحافظات المصرية',
      isActive: true,
    },
    {
      name: 'Egypt Business Directory Feed',
      type: 'DIRECTORY' as const,
      description: 'دليل الشركات والأنشطة التجارية المصرية ومواقعها الإلكترونية',
      isActive: true,
    },
    {
      name: 'Egypt Open Commercial Registry Dataset',
      type: 'OPEN_DATA' as const,
      description: 'قواعد البيانات المفتوحة للأنشطة التجارية المسجلة',
      isActive: true,
    },
    {
      name: 'CSV Import',
      type: 'CSV_IMPORT' as const,
      description: 'استيراد ملفات CSV المجمعة بواسطة فريق إدارة البيانات',
      isActive: true,
    },
    {
      name: 'Public Domain & Website Registry',
      type: 'WEBSITE' as const,
      description: 'فاحص النطاقات والمواقع الإلكترونية للشركات المحلية',
      isActive: true,
    },
    {
      name: 'Manual Entry',
      type: 'MANUAL' as const,
      description: 'إدخال يدوي ومراجعة مباشرة من قِبل فريق الجودة',
      isActive: true,
    },
  ];

  const sourceMap: Record<string, string> = {};
  for (const s of sourcesData) {
    const createdSource = await prisma.leadSource.create({
      data: {
        name: s.name,
        type: s.type,
        description: s.description,
        isActive: s.isActive,
        lastSyncAt: now,
      },
    });
    sourceMap[s.name] = createdSource.id;
  }

  // 6. Run Ingestion Pipeline for all 55 Seed Businesses
  await runIngestionPipeline({
    prisma,
    userId: adminUser.id,
    sourceName: 'Initial Seed Dataset',
    sourceId: sourceMap['Google Business Profile Export'],
    fileName: 'egypt_qualified_businesses_seed.csv',
    rawRecords: SEED_BUSINESSES,
    isMock: true,
  });

  // Also test multi-source deduplication during seed by ingesting 2 duplicate records from a second source
  await runIngestionPipeline({
    prisma,
    userId: adminUser.id,
    sourceName: 'Egypt Business Directory Feed',
    sourceId: sourceMap['Egypt Business Directory Feed'],
    fileName: 'directory_enrichment_sync.csv',
    rawRecords: [
      {
        name: 'عيادة دار الأسنان التخصصي - Dar Dental Clinic',
        category: 'Dental',
        city: 'القاهرة',
        phone: '+20 100 234 5101',
        source: 'Egypt Business Directory Feed',
        isMock: true,
      },
      {
        name: 'مركز سمايل كير لطب وتجميل الأسنان',
        category: 'Dental',
        city: 'القاهرة',
        phone: '01002345102',
        email: 'contact@smilecare-heliopolis.eg',
        source: 'Egypt Business Directory Feed',
        isMock: true,
      },
    ],
    isMock: true,
  });

  // Update LeadSource counts and vary lastVerifiedAt across leads so Freshness badges cover Fresh, Recently Verified, Needs Verification, Stale
  const allLeads = await prisma.lead.findMany({ orderBy: { createdAt: 'asc' } });
  for (let i = 0; i < allLeads.length; i++) {
    const lead = allLeads[i];
    let daysAgo = 2; // Fresh (0-7 days)
    if (i % 9 === 0) {
      daysAgo = 14; // Recently Verified (8-30 days)
    } else if (i % 13 === 0) {
      daysAgo = 45; // Needs Verification (31-90 days)
    } else if (i % 19 === 0) {
      daysAgo = 105; // Stale (90+ days)
    }
    const verifiedDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const isExclusive = lead.exclusive || lead.leadType === 'EXCLUSIVE';
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        isMock: true,
        lastVerifiedAt: verifiedDate,
        sourceId: sourceMap[lead.source] || sourceMap['Google Business Profile Export'],
        accessType: isExclusive ? 'EXCLUSIVE' : 'SHARED',
        creditCost: isExclusive ? 25 : 5,
        creditCostReason: isExclusive ? 'EXCLUSIVE_LEAD' : 'SHARED_LEAD',
        availableForClaim: lead.status === 'AVAILABLE',
      },
    });
  }

  for (const sName of Object.keys(sourceMap)) {
    const count = await prisma.lead.count({ where: { source: sName } });
    await prisma.leadSource.update({
      where: { id: sourceMap[sName] },
      data: { recordsCount: count },
    });
  }

  // 6b. Seed Phase 5 CreditPricingConfig
  await prisma.creditPricingConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      version: 'v1',
      sharedLeadBaseCost: 5,
      exclusiveLeadBaseCost: 25,
      sharedBaseCost: 5,
      exclusiveBaseCost: 25,
      highOpportunityCostBonus: 0,
      highOpportunityThreshold: 80,
      highQualityCostBonus: 0,
      highQualityThreshold: 85,
      highBudgetCostBonus: 0,
      highBudgetThresholdEgp: 500000,
      freshLeadBonus: 0,
      minCreditCost: 1,
      maxCreditCost: 100,
      defaultClaimExpirationDays: 90,
      autoRefundOnInvalidLead: true,
      autoRefundOnDuplicateLead: true,
      autoRefundOnClosedWithinHours: 24,
    },
  });

  // 7. Create sample Lead Claims, Status Histories, Feedbacks, Credit Accounts & Ledger Transactions
  const primaryDev = createdDevs[0];
  const sampleLeadsToClaim = allLeads.slice(0, 5);
  const sampleStatuses: ('WON' | 'MEETING' | 'INTERESTED' | 'REPLIED' | 'CONTACTED')[] = [
    'WON',
    'MEETING',
    'INTERESTED',
    'REPLIED',
    'CONTACTED',
  ];

  const primaryAccount = await prisma.developerCreditAccount.create({
    data: {
      developerId: primaryDev.id,
      balance: 45,
      reservedBalance: 0,
      lifetimePurchased: 50,
      lifetimeBonus: 0,
      lifetimeSpent: 5,
      lifetimeRefunded: 0,
      lifetimeExpired: 0,
      totalGranted: 50,
      totalSpent: 5,
      totalRefunded: 0,
      version: 6,
    },
  });

  await prisma.creditTransaction.create({
    data: {
      accountId: primaryAccount.id,
      developerId: primaryDev.id,
      type: 'PURCHASE',
      amount: 50,
      balanceBefore: 0,
      balanceAfter: 50,
      referenceType: 'SUBSCRIPTION',
      referenceId: primaryDev.id,
      reason: 'Initial Pro subscription credit grant (50 credits)',
      idempotencyKey: `seed-purchase-${primaryDev.id}`,
      actorId: primaryDev.id,
      performedById: primaryDev.id,
    },
  });

  let runningBalance = 50;
  for (let idx = 0; idx < sampleLeadsToClaim.length; idx++) {
    const targetLead = sampleLeadsToClaim[idx];
    const pStatus = sampleStatuses[idx];
    const isExcl = targetLead.exclusive || targetLead.leadType === 'EXCLUSIVE';
    const claimAccessType = isExcl ? 'EXCLUSIVE' : 'SHARED';

    const claim = await prisma.leadClaim.create({
      data: {
        leadId: targetLead.id,
        userId: primaryDev.id,
        developerId: primaryDev.id,
        status: 'ACTIVE',
        accessType: claimAccessType,
        pipelineStatus: pStatus,
        creditsSpent: 1,
        creditsCharged: 1,
        creditsRefunded: 0,
        creditCostReason: isExcl ? 'EXCLUSIVE_LEAD' : 'SHARED_LEAD',
        exclusiveClaim: isExcl,
        accessGranted: true,
        accessGrantedAt: now,
        notes:
          pStatus === 'WON'
            ? 'تم الاتفاق على تطوير موقع إلكتروني متكامل مع نظام حجز مواعيد بقيمة 16,500 ج.م واستلام الدفعة الأولى.'
            : pStatus === 'MEETING'
            ? 'تم تحديد موعد اجتماع عبر Zoom يوم الثلاثاء القادم لعرض العرض الفني والمالي.'
            : 'تم التواصل مع إدارة النشاط التجاري وإرسال سابقة الأعمال عبر واتساب.',
        lastContactedAt: new Date(now.getTime() - (idx + 1) * 24 * 60 * 60 * 1000),
        nextFollowUpAt: new Date(now.getTime() + (idx + 2) * 24 * 60 * 60 * 1000),
      },
    });

    const balBefore = runningBalance;
    runningBalance -= 1;
    await prisma.creditTransaction.create({
      data: {
        accountId: primaryAccount.id,
        developerId: primaryDev.id,
        type: 'CLAIM',
        amount: -1,
        balanceBefore: balBefore,
        balanceAfter: runningBalance,
        referenceType: 'LEAD_CLAIM',
        referenceId: claim.id,
        claimId: claim.id,
        leadId: targetLead.id,
        reason: isExcl ? 'EXCLUSIVE_LEAD' : 'SHARED_LEAD',
        idempotencyKey: `seed-claim-${claim.id}`,
        actorId: primaryDev.id,
        performedById: primaryDev.id,
      },
    });

    await prisma.lead.update({
      where: { id: targetLead.id },
      data: {
        currentPurchasers: 1,
        status: isExcl ? 'CLAIMED_FULL' : 'AVAILABLE',
        saleabilityStatus: isExcl ? 'CLAIMED_FULL' : 'AVAILABLE',
        availableForClaim: !isExcl,
        ...(isExcl
          ? {
              exclusiveClaimedAt: now,
              exclusiveClaimedById: primaryDev.id,
            }
          : {}),
      },
    });

    const claimedAtDate = new Date(now.getTime() - (idx + 3) * 24 * 60 * 60 * 1000);
    const firstContactDate = new Date(now.getTime() - (idx + 2) * 24 * 60 * 60 * 1000);
    const lastContactDate = new Date(now.getTime() - (idx + 1) * 24 * 60 * 60 * 1000);

    const engagement = await prisma.leadEngagement.create({
      data: {
        leadId: targetLead.id,
        developerId: primaryDev.id,
        claimId: claim.id,
        currentStatus: pStatus,
        isTerminal: pStatus === 'WON',
        closedAt: pStatus === 'WON' ? now : null,
        claimedAt: claimedAtDate,
        firstContactedAt: firstContactDate,
        lastContactedAt: lastContactDate,
        firstRepliedAt: ['REPLIED', 'INTERESTED', 'MEETING', 'WON'].includes(pStatus)
          ? lastContactDate
          : null,
        interestedAt: ['INTERESTED', 'MEETING', 'WON'].includes(pStatus) ? lastContactDate : null,
        meetingAt: ['MEETING', 'WON'].includes(pStatus) ? lastContactDate : null,
        wonAt: pStatus === 'WON' ? now : null,
        finalOutcome: pStatus === 'WON' ? 'WON' : null,
        outcomeReasonCode: pStatus === 'WON' ? 'DEAL_CLOSED_WON' : null,
        outcomeReasonNote:
          pStatus === 'WON'
            ? 'تم الاتفاق على تطوير موقع إلكتروني متكامل مع نظام حجز مواعيد بقيمة 16,500 ج.م.'
            : null,
        outcomeNote:
          pStatus === 'WON'
            ? 'تم الاتفاق على تطوير موقع إلكتروني متكامل مع نظام حجز مواعيد بقيمة 16,500 ج.م.'
            : null,
        estimatedProjectValue: pStatus === 'WON' ? 16500 : null,
        currency: 'EGP',
        wonReason:
          pStatus === 'WON' ? 'موقع إلكتروني متكامل مع نظام حجز مواعيد' : null,
      },
    });

    await prisma.leadStatusHistory.create({
      data: {
        claimId: claim.id,
        engagementId: engagement.id,
        leadId: targetLead.id,
        userId: primaryDev.id,
        developerId: primaryDev.id,
        previousStatus: 'NEW',
        newStatus: pStatus,
        actorType: 'DEVELOPER',
        actorId: primaryDev.id,
        notes: 'تحديث حالة المتابعة مع العميل',
      },
    });

    await prisma.contactAttempt.create({
      data: {
        engagementId: engagement.id,
        claimId: claim.id,
        leadId: targetLead.id,
        developerId: primaryDev.id,
        channel: idx % 2 === 0 ? 'PHONE' : 'WHATSAPP',
        result: pStatus === 'CONTACTED' ? 'MESSAGE_SENT' : 'ANSWERED',
        note: 'تم التواصل مع إدارة النشاط التجاري وعرض سابقة الأعمال.',
        attemptedAt: firstContactDate,
      },
    });

    await prisma.leadFeedback.create({
      data: {
        leadId: targetLead.id,
        userId: primaryDev.id,
        developerId: primaryDev.id,
        claimId: claim.id,
        engagementId: engagement.id,
        useful: true,
        category: idx === 0 ? 'SALES' : 'CONTACT',
        reasonCode: idx === 0 ? 'HIGH_INTEREST' : 'PHONE_ANSWERED',
        rating: 5,
        confidence: 'MEDIUM',
        comment: 'بيانات تواصل دقيقة والنشاط التجاري مهتم فعليًا بإنشاء موقع.',
        note: 'بيانات تواصل دقيقة والنشاط التجاري مهتم فعليًا بإنشاء موقع.',
      },
    });
  }

  // Seed credit accounts + ledger + refunded claim for second developer
  const secondDev = createdDevs[1];
  const secondAccount = await prisma.developerCreditAccount.create({
    data: {
      developerId: secondDev.id,
      balance: 18,
      reservedBalance: 0,
      lifetimePurchased: 20,
      lifetimeBonus: 0,
      lifetimeSpent: 7,
      lifetimeRefunded: 5,
      lifetimeExpired: 0,
      totalGranted: 20,
      totalSpent: 7,
      totalRefunded: 5,
      version: 4,
    },
  });

  await prisma.creditTransaction.create({
    data: {
      accountId: secondAccount.id,
      developerId: secondDev.id,
      type: 'PURCHASE',
      amount: 20,
      balanceBefore: 0,
      balanceAfter: 20,
      referenceType: 'SUBSCRIPTION',
      referenceId: secondDev.id,
      reason: 'Starter subscription credit grant (20 credits)',
      idempotencyKey: `seed-purchase-${secondDev.id}`,
      actorId: secondDev.id,
      performedById: secondDev.id,
    },
  });

  const sixthLead = allLeads[5];
  if (sixthLead) {
    const claim2 = await prisma.leadClaim.create({
      data: {
        leadId: sixthLead.id,
        userId: secondDev.id,
        developerId: secondDev.id,
        status: 'ACTIVE',
        accessType: 'SHARED',
        pipelineStatus: 'LOST',
        creditsSpent: 2,
        creditsCharged: 2,
        creditsRefunded: 0,
        creditCostReason: 'SHARED_LEAD',
        exclusiveClaim: false,
        accessGranted: true,
        accessGrantedAt: now,
        notes: 'تم التواصل ولكن صاحب النشاط اعتذر بسبب الميزانية الحالية.',
        lastContactedAt: now,
      },
    });
    await prisma.creditTransaction.create({
      data: {
        accountId: secondAccount.id,
        developerId: secondDev.id,
        type: 'CLAIM',
        amount: -2,
        balanceBefore: 20,
        balanceAfter: 18,
        referenceType: 'LEAD_CLAIM',
        referenceId: claim2.id,
        claimId: claim2.id,
        leadId: sixthLead.id,
        reason: 'SHARED_LEAD',
        idempotencyKey: `seed-claim-${claim2.id}`,
        actorId: secondDev.id,
        performedById: secondDev.id,
      },
    });

    const engagement2 = await prisma.leadEngagement.create({
      data: {
        leadId: sixthLead.id,
        developerId: secondDev.id,
        claimId: claim2.id,
        currentStatus: 'LOST',
        isTerminal: true,
        closedAt: now,
        claimedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        firstContactedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        lastContactedAt: now,
        lostAt: now,
        finalOutcome: 'LOST',
        outcomeReasonCode: 'PRICE',
        outcomeReasonNote: 'ميزانية العميل أقل من تكلفة المتجر المطلوب',
        outcomeNote: 'ميزانية العميل أقل من تكلفة المتجر المطلوب',
        lostReasonCode: 'PRICE',
        lostReasonNote: 'ميزانية العميل أقل من تكلفة المتجر المطلوب',
      },
    });

    await prisma.leadStatusHistory.create({
      data: {
        claimId: claim2.id,
        engagementId: engagement2.id,
        leadId: sixthLead.id,
        userId: secondDev.id,
        developerId: secondDev.id,
        previousStatus: 'CONTACTED',
        newStatus: 'LOST',
        reasonCode: 'PRICE',
        note: 'ميزانية العميل أقل من تكلفة المتجر المطلوب',
        notes: 'ميزانية العميل أقل من تكلفة المتجر المطلوب',
        actorType: 'DEVELOPER',
        actorId: secondDev.id,
      },
    });

    await prisma.contactAttempt.create({
      data: {
        engagementId: engagement2.id,
        claimId: claim2.id,
        leadId: sixthLead.id,
        developerId: secondDev.id,
        channel: 'PHONE',
        result: 'ANSWERED',
        note: 'مكالمة هاتفية لمناقشة العرض المالي.',
        attemptedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.leadFeedback.create({
      data: {
        leadId: sixthLead.id,
        userId: secondDev.id,
        developerId: secondDev.id,
        claimId: claim2.id,
        engagementId: engagement2.id,
        useful: false,
        reason: 'NOT_INTERESTED',
        category: 'SALES',
        reasonCode: 'PRICE_OBJECTION',
        rating: 3,
        confidence: 'MEDIUM',
        comment: 'العميل غير مستعد حاليًا للبدء بالسعر المقترح.',
        note: 'العميل غير مستعد حاليًا للبدء بالسعر المقترح.',
      },
    });
  }

  // Seed a REFUNDED / INVALID claim example on seventh lead
  const seventhLead = allLeads[6];
  if (seventhLead) {
    const invDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const refundedClaim = await prisma.leadClaim.create({
      data: {
        leadId: seventhLead.id,
        userId: secondDev.id,
        developerId: secondDev.id,
        status: 'REFUNDED',
        accessType: 'SHARED',
        pipelineStatus: 'INVALID',
        creditsSpent: 5,
        creditsCharged: 5,
        creditsRefunded: 5,
        creditCostReason: 'SHARED_LEAD',
        exclusiveClaim: false,
        accessGranted: false,
        accessGrantedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        claimedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        refundedAt: invDate,
        refundReason: 'Automatic refund: phone number disconnected upon verification',
        refundedBy: adminUser.id,
      },
    });

    await prisma.leadEngagement.create({
      data: {
        leadId: seventhLead.id,
        developerId: secondDev.id,
        claimId: refundedClaim.id,
        currentStatus: 'INVALID',
        isTerminal: true,
        closedAt: invDate,
        claimedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        invalidAt: invDate,
        invalidatedAt: invDate,
        finalOutcome: 'INVALID',
        outcomeReasonCode: 'WRONG_PHONE',
        outcomeReasonNote: 'Phone number disconnected upon call attempt',
        outcomeNote: 'Phone number disconnected upon call attempt',
        invalidReasonCode: 'WRONG_PHONE',
        invalidReasonNote: 'Phone number disconnected upon call attempt',
      },
    });

    await prisma.creditTransaction.create({
      data: {
        accountId: secondAccount.id,
        developerId: secondDev.id,
        type: 'CLAIM',
        amount: -5,
        balanceBefore: 18,
        balanceAfter: 13,
        referenceType: 'LEAD_CLAIM',
        referenceId: refundedClaim.id,
        claimId: refundedClaim.id,
        leadId: seventhLead.id,
        reason: 'SHARED_LEAD',
        idempotencyKey: `seed-claim-refunded-${refundedClaim.id}`,
        actorId: secondDev.id,
        performedById: secondDev.id,
      },
    });

    await prisma.creditTransaction.create({
      data: {
        accountId: secondAccount.id,
        developerId: secondDev.id,
        type: 'REFUND',
        amount: 5,
        balanceBefore: 13,
        balanceAfter: 18,
        referenceType: 'LEAD_CLAIM',
        referenceId: refundedClaim.id,
        claimId: refundedClaim.id,
        leadId: seventhLead.id,
        reason: 'Automatic refund: phone number disconnected upon verification',
        idempotencyKey: `seed-refund-${refundedClaim.id}`,
        actorId: adminUser.id,
        performedById: adminUser.id,
      },
    });
  }

  // Seed remaining developers' credit accounts & multi-developer shared lead scenario (Section 51)
  for (let i = 2; i < createdDevs.length; i++) {
    const devUser = createdDevs[i];
    const sub = await prisma.subscription.findUnique({ where: { userId: devUser.id } });
    const bal = sub?.credits ?? 0;
    const acc = await prisma.developerCreditAccount.create({
      data: {
        developerId: devUser.id,
        balance: bal,
        lifetimePurchased: bal,
        totalGranted: bal,
        version: 1,
      },
    });
    if (bal > 0) {
      await prisma.creditTransaction.create({
        data: {
          accountId: acc.id,
          developerId: devUser.id,
          type: 'PURCHASE',
          amount: bal,
          balanceBefore: 0,
          balanceAfter: bal,
          referenceType: 'SUBSCRIPTION',
          referenceId: devUser.id,
          reason: 'Initial subscription credit balance',
          idempotencyKey: `seed-init-${devUser.id}`,
        },
      });
    }
  }

  // Multi-developer shared lead scenario on allLeads[1] (already claimed by primaryDev with status MEETING):
  // secondDev has CLAIMED state, thirdDev has NOT_INTERESTED state on the same shared lead.
  const sharedMultiDevLead = allLeads[1];
  const thirdDev = createdDevs[2];
  if (sharedMultiDevLead && secondDev && thirdDev) {
    const sharedClaim2 = await prisma.leadClaim.create({
      data: {
        leadId: sharedMultiDevLead.id,
        userId: secondDev.id,
        developerId: secondDev.id,
        status: 'ACTIVE',
        accessType: 'SHARED',
        pipelineStatus: 'NEW',
        creditsSpent: 1,
        creditsCharged: 1,
        creditsRefunded: 0,
        creditCostReason: 'SHARED_LEAD',
        exclusiveClaim: false,
        accessGranted: true,
        accessGrantedAt: now,
        notes: 'تم الحصول على الفرصة وجارٍ التحضير للتواصل الهاتفي.',
      },
    });

    const sharedEng2 = await prisma.leadEngagement.create({
      data: {
        leadId: sharedMultiDevLead.id,
        developerId: secondDev.id,
        claimId: sharedClaim2.id,
        currentStatus: 'CLAIMED',
        isTerminal: false,
        claimedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      },
    });

    await prisma.leadStatusHistory.create({
      data: {
        claimId: sharedClaim2.id,
        engagementId: sharedEng2.id,
        leadId: sharedMultiDevLead.id,
        userId: secondDev.id,
        developerId: secondDev.id,
        previousStatus: null,
        newStatus: 'NEW',
        actorType: 'DEVELOPER',
        actorId: secondDev.id,
        notes: 'تم الحصول على الفرصة المشتركة',
      },
    });

    const sharedClaim3 = await prisma.leadClaim.create({
      data: {
        leadId: sharedMultiDevLead.id,
        userId: thirdDev.id,
        developerId: thirdDev.id,
        status: 'ACTIVE',
        accessType: 'SHARED',
        pipelineStatus: 'NOT_INTERESTED',
        creditsSpent: 1,
        creditsCharged: 1,
        creditsRefunded: 0,
        creditCostReason: 'SHARED_LEAD',
        exclusiveClaim: false,
        accessGranted: true,
        accessGrantedAt: now,
        notes: 'العميل يفضل التعامل مع مطور فردي وليس وكالة في الوقت الحالي.',
        lastContactedAt: now,
      },
    });

    const sharedEng3 = await prisma.leadEngagement.create({
      data: {
        leadId: sharedMultiDevLead.id,
        developerId: thirdDev.id,
        claimId: sharedClaim3.id,
        currentStatus: 'NOT_INTERESTED',
        isTerminal: true,
        closedAt: now,
        claimedAt: new Date(now.getTime() - 36 * 60 * 60 * 1000),
        firstContactedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        lastContactedAt: now,
        notInterestedAt: now,
        finalOutcome: 'NOT_INTERESTED',
        outcomeReasonCode: 'NOT_INTERESTED',
        outcomeReasonNote: 'العميل يفضل التعامل مع مطور فردي وليس وكالة.',
        outcomeNote: 'العميل يفضل التعامل مع مطور فردي وليس وكالة.',
      },
    });

    await prisma.leadStatusHistory.create({
      data: {
        claimId: sharedClaim3.id,
        engagementId: sharedEng3.id,
        leadId: sharedMultiDevLead.id,
        userId: thirdDev.id,
        developerId: thirdDev.id,
        previousStatus: 'CONTACTED',
        newStatus: 'NOT_INTERESTED',
        reasonCode: 'NOT_INTERESTED',
        note: 'العميل يفضل التعامل مع مطور فردي وليس وكالة.',
        notes: 'العميل يفضل التعامل مع مطور فردي وليس وكالة.',
        actorType: 'DEVELOPER',
        actorId: thirdDev.id,
      },
    });

    await prisma.lead.update({
      where: { id: sharedMultiDevLead.id },
      data: {
        currentPurchasers: 3,
        status: 'CLAIMED_FULL',
        saleabilityStatus: 'CLAIMED_FULL',
        availableForClaim: false,
      },
    });
  }

  const zeroCreditDev = await prisma.user.create({
    data: {
      email: 'zero.credits@leadforge.eg',
      name: 'م. كريم سامي (رصيد صفر)',
      passwordHash: devHash,
      role: 'DEVELOPER',
      status: 'ACTIVE',
      developerProfile: {
        create: {
          companyName: 'Kareem Web Studio',
          phone: '01099887766',
          services: ['Website Development'],
          locations: ['القاهرة'],
          niches: ['Dental', 'Restaurant'],
          minBudget: 5000,
          leadType: 'BOTH',
        },
      },
      subscription: {
        create: {
          planId: createdPlans['free'],
          status: 'ACTIVE',
          credits: 0,
          totalCreditsGranted: 3,
          creditsUsed: 3,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      },
      creditAccount: {
        create: {
          balance: 0,
          lifetimePurchased: 3,
          lifetimeSpent: 3,
          totalGranted: 3,
          totalSpent: 3,
          version: 2,
        },
      },
    },
    include: { creditAccount: true },
  });

  if (zeroCreditDev.creditAccount) {
    await prisma.creditTransaction.createMany({
      data: [
        {
          accountId: zeroCreditDev.creditAccount.id,
          developerId: zeroCreditDev.id,
          type: 'PURCHASE',
          amount: 3,
          balanceBefore: 0,
          balanceAfter: 3,
          referenceType: 'SUBSCRIPTION',
          referenceId: zeroCreditDev.id,
          reason: 'Free tier initial credits',
          idempotencyKey: `seed-zero-init-${zeroCreditDev.id}`,
        },
        {
          accountId: zeroCreditDev.creditAccount.id,
          developerId: zeroCreditDev.id,
          type: 'CLAIM',
          amount: -3,
          balanceBefore: 3,
          balanceAfter: 0,
          referenceType: 'LEAD_CLAIM',
          referenceId: zeroCreditDev.id,
          reason: 'Prior credit usage',
          idempotencyKey: `seed-zero-spend-${zeroCreditDev.id}`,
        },
      ],
    });
  }

  // 8. In-App Notifications for Primary Demo Developer
  await prisma.notification.createMany({
    data: [
      {
        userId: primaryDev.id,
        title: 'فرص جديدة متوافقة مع تخصصك',
        message: '28 new leads match your profile — يتوفر 28 عميلاً محتملاً جديدًا في القاهرة والجيزة يطابقون خدمات تطوير المواقع.',
        type: 'MATCHED_LEADS',
        link: '/leads',
        isRead: false,
      },
      {
        userId: primaryDev.id,
        title: 'صفقة ناجحة مسجلة (WON)',
        message: 'A lead you claimed was marked WON — تم تسجيل صفقة ناجحة مع عيادة دار الأسنان التخصصي.',
        type: 'LEAD_WON',
        link: '/my-leads',
        isRead: false,
      },
      {
        userId: primaryDev.id,
        title: 'حالة اشتراكك في الباقة الاحترافية (Pro)',
        message: 'لديك 45 نقطة رصيد متاحة لاقتناص عملاء جدد هذا الشهر.',
        type: 'SUBSCRIPTION',
        link: '/subscription',
        isRead: true,
      },
    ],
  });

  // 9. Phase 7: Seed MatchSnapshots, RuleReviewCandidates & DailyMetricSnapshots
  await ensurePhase7AndRefundSeedData(prisma);

  return {
    alreadySeeded: false,
    leadsCount: allLeads.length,
    usersCount: createdDevs.length + 2,
  };
}

async function ensurePhase7AndRefundSeedData(prisma: PrismaClient) {
  const now = new Date();
  const adminUser =
    (await prisma.user.findUnique({
      where: { email: DEMO_CREDENTIALS.admin.email },
    })) ||
    (await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    }));
  const primaryDev =
    (await prisma.user.findUnique({
      where: { email: DEMO_CREDENTIALS.developer.email },
    })) ||
    (await prisma.user.findFirst({
      where: { role: 'DEVELOPER' },
      orderBy: { createdAt: 'asc' },
    }));
  const secondDev =
    (await prisma.user.findUnique({
      where: { email: 'ahmed.web@leadforge.eg' },
      include: { creditAccount: true },
    })) || primaryDev;
  const allLeads = await prisma.lead.findMany({
    where: { isCanonical: true },
    orderBy: { createdAt: 'asc' },
    take: 15,
  });

  if (!adminUser || !primaryDev || !secondDev || allLeads.length === 0) {
    return;
  }

  // Ensure at least one canonical REFUNDED / INVALID claim of 5 credits exists for Phase 6 & 7 verification
  if (allLeads.length >= 7) {
    const seventhLead = allLeads[6];
    const invDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const refundedClaim = await prisma.leadClaim.upsert({
      where: {
        leadId_userId: { leadId: seventhLead.id, userId: secondDev.id },
      },
      update: {
        status: 'REFUNDED',
        pipelineStatus: 'INVALID',
        creditsSpent: 5,
        creditsCharged: 5,
        creditsRefunded: 5,
        refundedAt: invDate,
        refundReason:
          'Automatic refund: phone number disconnected upon verification',
        refundedBy: adminUser.id,
      },
      create: {
        leadId: seventhLead.id,
        userId: secondDev.id,
        developerId: secondDev.id,
        status: 'REFUNDED',
        accessType: 'SHARED',
        pipelineStatus: 'INVALID',
        creditsSpent: 5,
        creditsCharged: 5,
        creditsRefunded: 5,
        creditCostReason: 'SHARED_LEAD',
        exclusiveClaim: false,
        accessGranted: false,
        accessGrantedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        claimedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        refundedAt: invDate,
        refundReason:
          'Automatic refund: phone number disconnected upon verification',
        refundedBy: adminUser.id,
      },
    });

    await prisma.leadEngagement.upsert({
      where: {
        leadId_developerId: {
          leadId: seventhLead.id,
          developerId: secondDev.id,
        },
      },
      update: {
        currentStatus: 'INVALID',
        isTerminal: true,
        closedAt: invDate,
        invalidAt: invDate,
        invalidatedAt: invDate,
        finalOutcome: 'INVALID',
        outcomeReasonCode: 'WRONG_PHONE',
        invalidReasonCode: 'WRONG_PHONE',
      },
      create: {
        leadId: seventhLead.id,
        developerId: secondDev.id,
        claimId: refundedClaim.id,
        currentStatus: 'INVALID',
        isTerminal: true,
        closedAt: invDate,
        claimedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        invalidAt: invDate,
        invalidatedAt: invDate,
        finalOutcome: 'INVALID',
        outcomeReasonCode: 'WRONG_PHONE',
        outcomeReasonNote: 'Phone number disconnected upon call attempt',
        outcomeNote: 'Phone number disconnected upon call attempt',
        invalidReasonCode: 'WRONG_PHONE',
        invalidReasonNote: 'Phone number disconnected upon call attempt',
      },
    });
  }

  // Ensure MatchSnapshots are seeded
  const existingMatchSnapshotCount = await prisma.matchSnapshot.count();
  if (existingMatchSnapshotCount === 0) {
    const matchSnapshotsData = allLeads.slice(0, 12).map((lead, idx) => ({
      leadId: lead.id,
      developerId: idx < 8 ? primaryDev.id : secondDev.id,
      eligible: idx !== 11,
      rank: idx + 1,
      matchStrength: idx === 11 ? 0 : Math.max(45, 92 - idx * 4),
      rawMatchPoints: idx === 11 ? 0 : Math.max(45, 92 - idx * 4),
      opportunityScore: lead.score ?? 75,
      qualityScore: lead.qualityScore ?? 80,
      freshness: 'FRESH',
      matchedCriteria: [
        { ruleKey: 'EXACT_SERVICE_MATCH', key: 'EXACT_SERVICE_MATCH', points: 30 },
        { ruleKey: 'PRIMARY_CITY_MATCH', key: 'PRIMARY_CITY_MATCH', points: 25 },
        ...(idx % 2 === 0
          ? [
              {
                ruleKey: 'PREFERRED_NICHE_MATCH',
                key: 'PREFERRED_NICHE_MATCH',
                points: 20,
              },
            ]
          : []),
      ],
      failedCriteria: idx === 11 ? [{ ruleKey: 'EXCLUDED_NICHE_MISMATCH', reason: 'EXCLUDED_NICHE_MISMATCH' }] : [],
      hardFailures: idx === 11 ? ['EXCLUDED_NICHE_MISMATCH'] : [],
      warnings: [],
      matchVersion: 'v1',
    }));

    await prisma.matchSnapshot.createMany({
      data: matchSnapshotsData,
    });
  }

  // Ensure RuleReviewCandidates are seeded
  const existingRuleCandidateCount = await prisma.ruleReviewCandidate.count();
  if (existingRuleCandidateCount === 0) {
    await prisma.ruleReviewCandidate.createMany({
      data: [
        {
          ruleType: 'SCORING',
          ruleKey: 'HIGH_VALUE_NICHE',
          ruleName: 'قطاع تجاري ذو قيمة مرتفعة (High-Value Niche)',
          ruleVersion: 'v1',
          metric: 'WIN_RATE',
          metricVersion: 'WIN_RATE_V1',
          baselineValue: 0.1429,
          observedValue: 0.25,
          absoluteDifference: 0.1071,
          relativeDifference: 0.7495,
          sampleSize: 12,
          minimumSampleSize: 5,
          triggeredNumerator: 3,
          triggeredDenominator: 12,
          baselineNumerator: 2,
          baselineDenominator: 14,
          evidenceWindow: 'LAST_30_DAYS',
          recommendation:
            'Positive rule HIGH_VALUE_NICHE (+15) demonstrates +10.7% higher win rate vs baseline across 12 claims. Candidate for maintaining or +2 weight review.',
          evidenceDetails: {
            nicheCohort: ['Dental', 'Medical Clinic', 'Real Estate'],
            withRuleClaims: 12,
            withRuleWins: 3,
          },
          status: 'OPEN',
        },
        {
          ruleType: 'MATCHING',
          ruleKey: 'GOVERNORATE_FALLBACK_MATCH',
          ruleName: 'مطابقة على مستوى المحافظة (Governorate Fallback)',
          ruleVersion: 'v1',
          metric: 'WIN_RATE',
          metricVersion: 'WIN_RATE_V1',
          baselineValue: 0.2,
          observedValue: 0.0833,
          absoluteDifference: -0.1167,
          relativeDifference: -0.5835,
          sampleSize: 12,
          minimumSampleSize: 5,
          triggeredNumerator: 1,
          triggeredDenominator: 12,
          baselineNumerator: 3,
          baselineDenominator: 15,
          evidenceWindow: 'LAST_30_DAYS',
          recommendation:
            'Matching rule GOVERNORATE_FALLBACK_MATCH (+12) shows lower conversion than exact city matches (-11.7% vs baseline). Flagged for Admin human review.',
          evidenceDetails: {
            withRuleClaims: 12,
            withRuleWins: 1,
          },
          status: 'UNDER_REVIEW',
        },
        {
          ruleType: 'QUALITY',
          ruleKey: 'VERIFIED_PHONE',
          ruleName: 'رقم هاتف متحقق منه (Verified Phone)',
          ruleVersion: 'v1',
          metric: 'WIN_RATE',
          metricVersion: 'WIN_RATE_V1',
          baselineValue: 0.0909,
          observedValue: 0.2222,
          absoluteDifference: 0.1313,
          relativeDifference: 1.4444,
          sampleSize: 18,
          minimumSampleSize: 5,
          triggeredNumerator: 4,
          triggeredDenominator: 18,
          baselineNumerator: 1,
          baselineDenominator: 11,
          evidenceWindow: 'LAST_30_DAYS',
          recommendation:
            'Verified phone leads convert at 22.2% vs 9.1% unverified baseline. Approved by Admin as a core quality gate.',
          evidenceDetails: {
            verifiedClaims: 18,
            verifiedWins: 4,
          },
          status: 'APPROVED',
          reviewedAt: now,
          reviewedBy: adminUser.id,
          decision:
            'Approved: keep VERIFIED_PHONE as mandatory saleability requirement.',
          notes: 'تأكيد استمرار اشتراط التحقق من الهاتف قبل عرض الفرصة للبيع.',
        },
      ],
    });
  }

  // Ensure DailyMetricSnapshots are seeded
  const seedDateKey = now.toISOString().slice(0, 10);
  const seedSnapshotDate = new Date(`${seedDateKey}T00:00:00.000Z`);
  const seedSnapshots = [
    {
      date: seedSnapshotDate,
      dateKey: seedDateKey,
      metric: 'TOTAL_LEADS',
      dimension: 'GLOBAL',
      dimensionValue: 'ALL',
      value: allLeads.length,
      numerator: allLeads.length,
      denominator: 1,
      status: 'VALID',
      version: 'TOTAL_LEADS_V1',
    },
    {
      date: seedSnapshotDate,
      dateKey: seedDateKey,
      metric: 'WIN_RATE',
      dimension: 'GLOBAL',
      dimensionValue: 'ALL',
      value: 0.125,
      numerator: 1,
      denominator: 8,
      status: 'VALID',
      version: 'WIN_RATE_V1',
    },
    {
      date: seedSnapshotDate,
      dateKey: seedDateKey,
      metric: 'CONTACT_RATE',
      dimension: 'GLOBAL',
      dimensionValue: 'ALL',
      value: 0.875,
      numerator: 7,
      denominator: 8,
      status: 'VALID',
      version: 'CONTACT_RATE_V1',
    },
  ];

  for (const snap of seedSnapshots) {
    await prisma.dailyMetricSnapshot.upsert({
      where: {
        dateKey_metric_dimension_dimensionValue_version: {
          dateKey: snap.dateKey,
          metric: snap.metric,
          dimension: snap.dimension,
          dimensionValue: snap.dimensionValue,
          version: snap.version,
        },
      },
      update: snap,
      create: snap,
    });
  }

  await ensurePhase8IngestionSeedData(prisma, adminUser.id);
}

async function ensurePhase8IngestionSeedData(prisma: PrismaClient, adminId: string) {
  const now = new Date();

  const sourceConfigs: {
    name: string;
    type: 'GOOGLE_BUSINESS' | 'DIRECTORY' | 'OPEN_DATA' | 'CSV_IMPORT' | 'WEBSITE' | 'MANUAL';
    collectorKey: string;
    collectorVersion: string;
    configurationStatus: string;
    healthStatus: string;
    enabled: boolean;
    priority: number;
    scheduleIntervalMinutes: number | null;
    consecutiveFailures: number;
    totalSuccessCount: number;
    totalFailureCount: number;
    averageDurationMs: number;
    acquisitionCostPerRunEgp: number | null;
    acquisitionCostPerRecordEgp: number | null;
    description: string;
  }[] = [
    {
      name: 'Egypt Open Commercial Registry Dataset',
      type: 'OPEN_DATA',
      collectorKey: 'open-data-v1',
      collectorVersion: 'open-data-v1',
      configurationStatus: 'CONFIGURED',
      healthStatus: 'HEALTHY',
      enabled: true,
      priority: 10,
      scheduleIntervalMinutes: 360,
      consecutiveFailures: 0,
      totalSuccessCount: 8,
      totalFailureCount: 0,
      averageDurationMs: 420,
      acquisitionCostPerRunEgp: 15,
      acquisitionCostPerRecordEgp: 0.5,
      description: 'قواعد البيانات المفتوحة للأنشطة التجارية المسجلة في مصر',
    },
    {
      name: 'Egypt Business Directory Feed',
      type: 'DIRECTORY',
      collectorKey: 'directory-v1',
      collectorVersion: 'directory-v1',
      configurationStatus: 'CONFIGURED',
      healthStatus: 'HEALTHY',
      enabled: true,
      priority: 20,
      scheduleIntervalMinutes: 720,
      consecutiveFailures: 0,
      totalSuccessCount: 6,
      totalFailureCount: 1,
      averageDurationMs: 680,
      acquisitionCostPerRunEgp: 25,
      acquisitionCostPerRecordEgp: 0.75,
      description: 'دليل الشركات والأنشطة التجارية المصرية ومواقعها الإلكترونية',
    },
    {
      name: 'CSV Import',
      type: 'CSV_IMPORT',
      collectorKey: 'csv-v1',
      collectorVersion: 'csv-v1',
      configurationStatus: 'CONFIGURED',
      healthStatus: 'HEALTHY',
      enabled: true,
      priority: 30,
      scheduleIntervalMinutes: null,
      consecutiveFailures: 0,
      totalSuccessCount: 5,
      totalFailureCount: 0,
      averageDurationMs: 310,
      acquisitionCostPerRunEgp: 10,
      acquisitionCostPerRecordEgp: 0.25,
      description: 'استيراد ملفات CSV المجمعة بواسطة فريق إدارة البيانات',
    },
    {
      name: 'Public Domain & Website Registry',
      type: 'WEBSITE',
      collectorKey: 'website-v1',
      collectorVersion: 'website-v1',
      configurationStatus: 'CONFIGURED',
      healthStatus: 'DEGRADED',
      enabled: true,
      priority: 40,
      scheduleIntervalMinutes: 1440,
      consecutiveFailures: 1,
      totalSuccessCount: 4,
      totalFailureCount: 2,
      averageDurationMs: 1450,
      acquisitionCostPerRunEgp: 20,
      acquisitionCostPerRecordEgp: 1.0,
      description: 'فاحص النطاقات والمواقع الإلكترونية للشركات المحلية',
    },
    {
      name: 'Google Business Profile Export',
      type: 'GOOGLE_BUSINESS',
      collectorKey: 'google-business-v1',
      collectorVersion: 'google-business-v1',
      configurationStatus: process.env.GOOGLE_PLACES_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
      healthStatus: process.env.GOOGLE_PLACES_API_KEY ? 'HEALTHY' : 'NOT_CONFIGURED',
      enabled: true,
      priority: 50,
      scheduleIntervalMinutes: 1440,
      consecutiveFailures: 0,
      totalSuccessCount: 3,
      totalFailureCount: 0,
      averageDurationMs: 890,
      acquisitionCostPerRunEgp: null,
      acquisitionCostPerRecordEgp: null,
      description: 'بيانات الأنشطة التجارية الموثقة من Google Business (يتطلب مفتاح API للتشغيل المباشر)',
    },
    {
      name: 'Manual Entry',
      type: 'MANUAL',
      collectorKey: 'manual-v1',
      collectorVersion: 'manual-v1',
      configurationStatus: 'CONFIGURED',
      healthStatus: 'HEALTHY',
      enabled: true,
      priority: 60,
      scheduleIntervalMinutes: null,
      consecutiveFailures: 0,
      totalSuccessCount: 10,
      totalFailureCount: 0,
      averageDurationMs: 120,
      acquisitionCostPerRunEgp: null,
      acquisitionCostPerRecordEgp: null,
      description: 'إدخال يدوي ومراجعة مباشرة من قِبل فريق الجودة',
    },
    {
      name: 'Legacy YellowPages Archive Feed',
      type: 'DIRECTORY',
      collectorKey: 'directory-v1',
      collectorVersion: 'directory-v1',
      configurationStatus: 'CONFIGURED',
      healthStatus: 'DISABLED',
      enabled: false,
      priority: 90,
      scheduleIntervalMinutes: null,
      consecutiveFailures: 0,
      totalSuccessCount: 1,
      totalFailureCount: 0,
      averageDurationMs: 500,
      acquisitionCostPerRunEgp: null,
      acquisitionCostPerRecordEgp: null,
      description: 'مصدر أرشيفي قديم متوقف عن التحديث (Disabled Source)',
    },
  ];

  const sourceIdMap: Record<string, string> = {};
  for (const sc of sourceConfigs) {
    const upserted = await prisma.leadSource.upsert({
      where: { name: sc.name },
      update: {
        collectorKey: sc.collectorKey,
        collectorVersion: sc.collectorVersion,
        contractVersion: 'INGESTION_CONTRACT_V1',
        configurationStatus: sc.configurationStatus,
        healthStatus: sc.healthStatus,
        enabled: sc.enabled,
        isActive: sc.enabled,
        priority: sc.priority,
        scheduleIntervalMinutes: sc.scheduleIntervalMinutes,
        consecutiveFailures: sc.consecutiveFailures,
        totalSuccessCount: sc.totalSuccessCount,
        totalFailureCount: sc.totalFailureCount,
        averageDurationMs: sc.averageDurationMs,
        acquisitionCostPerRunEgp: sc.acquisitionCostPerRunEgp,
        acquisitionCostPerRecordEgp: sc.acquisitionCostPerRecordEgp,
        lastSyncAt: now,
        lastSuccessAt: sc.totalSuccessCount > 0 ? now : null,
      },
      create: {
        name: sc.name,
        type: sc.type,
        description: sc.description,
        collectorKey: sc.collectorKey,
        collectorVersion: sc.collectorVersion,
        contractVersion: 'INGESTION_CONTRACT_V1',
        configurationStatus: sc.configurationStatus,
        healthStatus: sc.healthStatus,
        enabled: sc.enabled,
        isActive: sc.enabled,
        priority: sc.priority,
        scheduleIntervalMinutes: sc.scheduleIntervalMinutes,
        consecutiveFailures: sc.consecutiveFailures,
        totalSuccessCount: sc.totalSuccessCount,
        totalFailureCount: sc.totalFailureCount,
        averageDurationMs: sc.averageDurationMs,
        acquisitionCostPerRunEgp: sc.acquisitionCostPerRunEgp,
        acquisitionCostPerRecordEgp: sc.acquisitionCostPerRecordEgp,
        lastSyncAt: now,
        lastSuccessAt: sc.totalSuccessCount > 0 ? now : null,
      },
    });
    sourceIdMap[sc.name] = upserted.id;
  }

  // Seed synthetic Phase 8 ImportJobs if not already seeded
  const existingPhase8Jobs = await prisma.importJob.count({
    where: { idempotencyKey: { startsWith: 'seed-phase8-' } },
  });

  if (existingPhase8Jobs === 0) {
    const partialJob = await prisma.importJob.create({
      data: {
        userId: adminId,
        sourceId: sourceIdMap['Public Domain & Website Registry'],
        sourceName: 'Public Domain & Website Registry',
        collectorVersion: 'website-v1',
        contractVersion: 'INGESTION_CONTRACT_V1',
        triggerType: 'MANUAL',
        status: 'PARTIALLY_COMPLETED',
        discoveredCount: 6,
        fetchedCount: 6,
        normalizedCount: 5,
        totalRows: 6,
        validCount: 4,
        insertedCount: 3,
        updatedCount: 1,
        duplicateCount: 1,
        invalidCount: 0,
        failedCount: 1,
        saleableCount: 4,
        deadLetterCount: 1,
        retryCount: 2,
        durationMs: 1420,
        errorCode: 'SOURCE_TIMEOUT',
        errorSummary: '1 record failed after retry exhaustion due to upstream website timeout',
        idempotencyKey: 'seed-phase8-partial-job-1',
        acquisitionCostEgp: 26,
        startedAt: new Date(now.getTime() - 4 * 3600_000),
        completedAt: new Date(now.getTime() - 4 * 3600_000 + 1420),
      },
    });

    await prisma.importJob.create({
      data: {
        userId: adminId,
        sourceId: sourceIdMap['Egypt Business Directory Feed'],
        sourceName: 'Egypt Business Directory Feed',
        collectorVersion: 'directory-v1',
        contractVersion: 'INGESTION_CONTRACT_V1',
        triggerType: 'SCHEDULED',
        status: 'FAILED',
        discoveredCount: 5,
        fetchedCount: 0,
        normalizedCount: 0,
        totalRows: 5,
        validCount: 0,
        duplicateCount: 0,
        invalidCount: 0,
        failedCount: 5,
        deadLetterCount: 1,
        retryCount: 3,
        durationMs: 3200,
        errorCode: 'RETRY_EXHAUSTED',
        errorSummary: 'Upstream directory endpoint returned HTTP 503 across 3 retry attempts',
        idempotencyKey: 'seed-phase8-failed-job-2',
        startedAt: new Date(now.getTime() - 12 * 3600_000),
        completedAt: new Date(now.getTime() - 12 * 3600_000 + 3200),
      },
    });

    await prisma.importJob.create({
      data: {
        userId: adminId,
        sourceId: sourceIdMap['CSV Import'],
        sourceName: 'CSV Import',
        fileName: 'cairo_medical_resync.csv',
        collectorVersion: 'csv-v1',
        contractVersion: 'INGESTION_CONTRACT_V1',
        triggerType: 'CSV_UPLOAD',
        status: 'COMPLETED',
        discoveredCount: 10,
        fetchedCount: 10,
        normalizedCount: 10,
        totalRows: 10,
        validCount: 2,
        insertedCount: 2,
        updatedCount: 8,
        duplicateCount: 8,
        invalidCount: 0,
        failedCount: 0,
        saleableCount: 2,
        deadLetterCount: 0,
        retryCount: 0,
        durationMs: 290,
        idempotencyKey: 'seed-phase8-dup-heavy-job-3',
        acquisitionCostEgp: 12.5,
        startedAt: new Date(now.getTime() - 24 * 3600_000),
        completedAt: new Date(now.getTime() - 24 * 3600_000 + 290),
      },
    });

    await prisma.deadLetterRecord.createMany({
      data: [
        {
          sourceId: sourceIdMap['Public Domain & Website Registry'],
          sourceName: 'Public Domain & Website Registry',
          sourceType: 'WEBSITE',
          importJobId: partialJob.id,
          externalId: 'web-seed-dl-001',
          collectorVersion: 'website-v1',
          rawPayload: {
            name: 'مركز الشفاء التخصصي للعلاج الطبيعي والتأهيل',
            category: 'Medical',
            city: 'القاهرة',
            area: 'مصر الجديدة',
            address: 'شارع الحجاز، مصر الجديدة، القاهرة',
            phone: '01098761234',
            website: 'http://alshifaa-rehab-center.eg',
            source: 'Public Domain & Website Registry',
          },
          failureReason: 'Website inspection timed out after 3 retries (5000ms limit)',
          errorCode: 'SOURCE_TIMEOUT',
          lastError: 'Website inspection timed out after 3 retries (5000ms limit)',
          retryCount: 3,
          maxRetries: 3,
          status: 'DEAD_LETTER',
        },
        {
          sourceId: sourceIdMap['CSV Import'],
          sourceName: 'CSV Import',
          sourceType: 'CSV_IMPORT',
          importJobId: partialJob.id,
          externalId: 'csv-seed-dl-002',
          collectorVersion: 'csv-v1',
          rawPayload: {
            name: '',
            category: 'Unknown',
            city: '',
            phone: 'invalid-phone',
          },
          failureReason: 'Missing business name and invalid Egyptian phone number',
          errorCode: 'INVALID_SOURCE_RECORD',
          lastError: 'Missing business name and invalid Egyptian phone number',
          retryCount: 1,
          maxRetries: 3,
          status: 'DEAD_LETTER',
        },
      ],
    });
  }
}



