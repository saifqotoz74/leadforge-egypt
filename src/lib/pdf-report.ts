/**
 * LeadForge Egypt — Server-Side Deterministic Lead PDF Report Generator
 * Rule-Based, Zero AI claims, Developer Branded
 */

export interface LeadReportData {
  developerName: string;
  developerCompany?: string | null;
  developerEmail?: string | null;
  developerPhone?: string | null;
  leadId: string;
  businessName: string;
  category: string;
  governorate: string;
  city: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  websiteStatus: string;
  score: number;
  qualityScore: number;
  temperature: string;
  ownershipType: string;
  reviewCount: number;
  branchCount: number;
  estimatedBudget: number;
  rules: Array<{ label: string; points: number }>;
  talkTrack: string[];
  generatedAt: Date;
}

const ARABIC_TRANSLITERATION_MAP: Record<string, string> = {
  'ا': 'A', 'أ': 'A', 'إ': 'E', 'آ': 'Aa', 'ء': "'", 'ب': 'B', 'ت': 'T', 'ث': 'Th',
  'ج': 'G', 'ح': 'H', 'خ': 'Kh', 'د': 'D', 'ذ': 'Z', 'ر': 'R', 'ز': 'Z', 'س': 'S',
  'ش': 'Sh', 'ص': 'S', 'ض': 'D', 'ط': 'T', 'ظ': 'Z', 'ع': 'A', 'غ': 'Gh', 'ف': 'F',
  'ق': 'Q', 'ك': 'K', 'ل': 'L', 'م': 'M', 'ن': 'N', 'ه': 'H', 'و': 'W', 'ي': 'Y',
  'ى': 'A', 'ة': 'a', 'ئ': "'", 'ؤ': "'", 'ـ': '',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const COMMON_TERMS_MAP: Record<string, string> = {
  'عيادات الأسنان': 'Dental Clinics',
  'Dental': 'Dental Clinics',
  'المراكز الطبية والعيادات': 'Medical & Clinics',
  'Medical': 'Medical & Clinics',
  'المطاعم والكافيهات': 'Restaurants & Cafes',
  'Restaurant': 'Restaurants & Cafes',
  'العقارات والمقاولات': 'Real Estate & Contracting',
  'Real Estate': 'Real Estate & Contracting',
  'التجارة والمحلات التجارية': 'Retail & Stores',
  'Retail': 'Retail & Stores',
  'التعليم والأكاديميات': 'Education & Academies',
  'Education': 'Education & Academies',
  'السيارات ومراكز الصيانة': 'Automotive & Repair',
  'Automotive': 'Automotive & Repair',
  'مراكز التجميل والعناية': 'Beauty & Spas',
  'Beauty': 'Beauty & Spas',
  'أنشطة تجارية عامة': 'General Businesses',
  'Other': 'General Businesses',
  'القاهرة': 'Cairo',
  'الجيزة': 'Giza',
  'الإسكندرية': 'Alexandria',
  'المعادي': 'Maadi',
  'مدينة نصر': 'Nasr City',
  'مصر الجديدة': 'Heliopolis',
  'الشيخ زايد': 'Sheikh Zayed',
  '6 أكتوبر': '6th of October',
  'التجمع الخامس': 'New Cairo (Fifth Settlement)',
  'القاهرة الجديدة': 'New Cairo',
  'الدقي': 'Dokki',
  'المهندسين': 'Mohandessin',
  'الزمالك': 'Zamalek',
};

export function transliterateArabicToLatin(text: string): string {
  if (!text) return '';
  if (COMMON_TERMS_MAP[text.trim()]) {
    return COMMON_TERMS_MAP[text.trim()];
  }
  let result = '';
  for (const ch of text) {
    if (ARABIC_TRANSLITERATION_MAP[ch] !== undefined) {
      result += ARABIC_TRANSLITERATION_MAP[ch];
    } else {
      result += ch;
    }
  }
  return result;
}

function escapePdf(str: string): string {
  // Transliterate Arabic glyphs so words remain readable in Type1 font
  const transliterated = transliterateArabicToLatin(str);
  return transliterated
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildDeterministicTalkTrack(lead: {
  websiteStatus: string;
  reviewCount: number;
  branchCount: number;
  category: string;
  city: string;
  score: number;
}): string[] {
  const points: string[] = [];

  if (lead.websiteStatus === 'NO_WEBSITE') {
    points.push(
      'Target has zero existing web presence. Pitch core portfolio, domain registration, and Google Business Profile integration.'
    );
  } else if (lead.websiteStatus === 'POOR_WEBSITE') {
    points.push(
      'Target has an outdated or non-responsive website. Pitch modern mobile UX redesign, speed optimization, and SEO uplift.'
    );
  }

  if (lead.reviewCount > 50) {
    points.push(
      `Strong customer engagement (${lead.reviewCount} Google reviews). Pitch booking/ordering widget and social proof integration.`
    );
  } else {
    points.push(
      'Emerging customer base. Pitch lead capture landing page and Google review collection funnels.'
    );
  }

  if (lead.branchCount > 1) {
    points.push(
      `Multi-branch operational scale (${lead.branchCount} locations). Pitch multi-location branch locator and corporate portal.'`
    );
  }

  points.push(
    `Niche focus: ${lead.category} services in ${lead.city}. Reference sector-specific compliance, mobile-first Arabic RTL layout, and WhatsApp direct checkout.'`
  );

  return points;
}

export function generatePdfBuffer(data: LeadReportData): Buffer {
  const streamLines: string[] = [];

  // Setup text stream
  streamLines.push('BT');
  streamLines.push('/F1 20 Tf');
  streamLines.push('50 780 Td');
  streamLines.push(`(LEADS4DEV - QUALIFIED LEAD REPORT) Tj`);

  streamLines.push('/F1 10 Tf');
  streamLines.push('0 -20 Td');
  streamLines.push(
    `(${escapePdf(`Prepared for: ${data.developerName}${data.developerCompany ? ` (${data.developerCompany})` : ''} | ${data.generatedAt.toISOString().slice(0, 10)}`)}) Tj`
  );

  // Divider
  streamLines.push('/F1 14 Tf');
  streamLines.push('0 -30 Td');
  streamLines.push(`(1. BUSINESS PROFILE & CONTACT DATA) Tj`);

  streamLines.push('/F1 10 Tf');
  streamLines.push('0 -18 Td');
  streamLines.push(`(${escapePdf(`Business: ${data.businessName}`)}) Tj`);

  streamLines.push('0 -15 Td');
  streamLines.push(`(${escapePdf(`Category: ${data.category} | Location: ${data.governorate}, ${data.city}`)}) Tj`);

  streamLines.push('0 -15 Td');
  streamLines.push(`(${escapePdf(`Phone: ${data.phone || 'N/A (Field Visit Opportunity)'}`)}) Tj`);

  streamLines.push('0 -15 Td');
  streamLines.push(`(${escapePdf(`Email: ${data.email || 'N/A'} | Website: ${data.website || 'None (High Opportunity)'}`)}) Tj`);

  // Scores
  streamLines.push('/F1 14 Tf');
  streamLines.push('0 -30 Td');
  streamLines.push(`(2. DETERMINISTIC QUALIFICATION SCORES) Tj`);

  streamLines.push('/F1 10 Tf');
  streamLines.push('0 -18 Td');
  streamLines.push(
    `(${escapePdf(`Opportunity Score: ${data.score}/100 [${data.temperature}] | Quality Score: ${data.qualityScore}/100`)}) Tj`
  );

  streamLines.push('0 -15 Td');
  streamLines.push(
    `(${escapePdf(`Ownership: ${data.ownershipType} | Estimated Budget: ${data.estimatedBudget} EGP`)}) Tj`
  );

  // Score Breakdown
  streamLines.push('/F1 14 Tf');
  streamLines.push('0 -30 Td');
  streamLines.push(`(3. EXPLAINABLE RULE BREAKDOWN) Tj`);

  streamLines.push('/F1 9 Tf');
  for (const rule of data.rules.slice(0, 5)) {
    streamLines.push('0 -15 Td');
    streamLines.push(`(${escapePdf(`+ ${rule.points} pts: ${rule.label}`)}) Tj`);
  }

  // Talk Track
  streamLines.push('/F1 14 Tf');
  streamLines.push('0 -30 Td');
  streamLines.push(`(4. SUGGESTED TALK TRACK & PITCH STRATEGY) Tj`);

  streamLines.push('/F1 9 Tf');
  for (const item of data.talkTrack) {
    streamLines.push('0 -16 Td');
    streamLines.push(`(${escapePdf(`* ${item}`)}) Tj`);
  }

  // Footer Note
  streamLines.push('/F1 8 Tf');
  streamLines.push('0 -35 Td');
  streamLines.push(
    `(${escapePdf('Notice: Strictly deterministic rule-based qualification. Zero speculative or unverified data.')}) Tj`
  );

  streamLines.push('ET');

  const contentStream = streamLines.join('\n');
  const streamLength = Buffer.byteLength(contentStream, 'utf8');

  const objects: string[] = [];
  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj';
  objects[2] = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj';
  objects[3] =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj';
  objects[4] = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream\nendobj`;
  objects[5] =
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj';

  let offset = '%PDF-1.4\n'.length;
  const xrefEntries: string[] = ['0000000000 65535 f \n'];

  for (let i = 1; i <= 5; i++) {
    xrefEntries[i] = String(offset).padStart(10, '0') + ' 00000 n \n';
    offset += objects[i].length + 1; // +1 for newline
  }

  const xrefOffset = offset;
  const xref = `xref\n0 6\n${xrefEntries.join('')}`;
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const pdfBody = ['%PDF-1.4', objects[1], objects[2], objects[3], objects[4], objects[5], xref, trailer].join(
    '\n'
  );

  return Buffer.from(pdfBody, 'utf8');
}
