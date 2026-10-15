import { describe, it, expect } from 'vitest';
import {
  normalizeEgyptianPhone,
  generateEgyptianPitchTemplates,
  buildWhatsAppDirectUrl,
} from '../src/lib/outreach/whatsapp';

describe('WhatsApp Outreach Hub & Egyptian Pitch Generator', () => {
  describe('Egyptian Phone Normalization', () => {
    it('normalizes local 11-digit mobile numbers starting with 01x', () => {
      const res = normalizeEgyptianPhone('01012345678');
      expect(res.isValidEgyptianMobile).toBe(true);
      expect(res.waPhone).toBe('201012345678');
      expect(res.displayFormatted).toBe('+20 10 1234 5678');
    });

    it('normalizes numbers starting with 201x or +201x', () => {
      const res1 = normalizeEgyptianPhone('+201198765432');
      expect(res1.isValidEgyptianMobile).toBe(true);
      expect(res1.waPhone).toBe('201198765432');
      expect(res1.displayFormatted).toBe('+20 11 9876 5432');

      const res2 = normalizeEgyptianPhone('00201234567890');
      expect(res2.isValidEgyptianMobile).toBe(true);
      expect(res2.waPhone).toBe('201234567890');
      expect(res2.displayFormatted).toBe('+20 12 3456 7890');
    });

    it('handles landlines or non-standard inputs safely', () => {
      const res = normalizeEgyptianPhone('0233445566');
      expect(res.isValidEgyptianMobile).toBe(false);
      expect(res.displayFormatted).toBe('0233445566');
    });

    it('handles empty or null inputs gracefully', () => {
      const res = normalizeEgyptianPhone(null);
      expect(res.isValidEgyptianMobile).toBe(false);
      expect(res.waPhone).toBe('');
      expect(res.displayFormatted).toBe('غير متوفر');
    });
  });

  describe('Direct WhatsApp URL Builder', () => {
    it('builds valid, escaped wa.me URLs', () => {
      const url = buildWhatsAppDirectUrl('01012345678', 'مساء الخير يا فندم');
      expect(url).toContain('https://wa.me/201012345678?text=');
      expect(url).toContain(encodeURIComponent('مساء الخير يا فندم'));
    });
  });

  describe('Sector-Specific Egyptian Pitch Templates', () => {
    it('recommends Dental Clinic template for dental business', () => {
      const res = generateEgyptianPitchTemplates({
        businessName: 'عيادة د. أحمد لطب وزراعة الأسنان',
        category: 'Dentistry',
        city: 'التجمع الخامس',
      });
      expect(res.recommendedId).toBe('DENTAL_CLINIC');
      const tmpl = res.templates.find((t) => t.id === 'DENTAL_CLINIC');
      expect(tmpl).toBeDefined();
      expect(tmpl?.text).toContain('عيادات الأسنان');
      expect(tmpl?.text).toContain('التجمع الخامس');
    });

    it('recommends Restaurant & Cafe template for food business', () => {
      const res = generateEgyptianPitchTemplates({
        businessName: 'مطعم وكافيه السرايا',
        category: 'Restaurants',
        city: 'الشيخ زايد',
      });
      expect(res.recommendedId).toBe('RESTAURANT_CAFE');
      const tmpl = res.templates.find((t) => t.id === 'RESTAURANT_CAFE');
      expect(tmpl?.text).toContain('منيو ديجيتال QR');
      expect(tmpl?.text).toContain('تطبيقات التوصيل');
    });

    it('recommends Real Estate template for property brokers', () => {
      const res = generateEgyptianPitchTemplates({
        businessName: 'إعمار المستقبل للاستثمار العقاري',
        category: 'Real Estate',
        city: 'القاهرة الجديدة',
      });
      expect(res.recommendedId).toBe('REAL_ESTATE');
      const tmpl = res.templates.find((t) => t.id === 'REAL_ESTATE');
      expect(tmpl?.text).toContain('صفحات هبوط');
      expect(tmpl?.text).toContain('ليدز المشترين');
    });

    it('recommends Contracting & Decor template for interior design firms', () => {
      const res = generateEgyptianPitchTemplates({
        businessName: 'نيو ديزاين للتشطيبات والديكور',
        category: 'Contracting',
        city: 'المعادي',
      });
      expect(res.recommendedId).toBe('CONTRACTING_DECOR');
      const tmpl = res.templates.find((t) => t.id === 'CONTRACTING_DECOR');
      expect(tmpl?.text).toContain('بورتفوليو رقمي فاخر');
      expect(tmpl?.text).toContain('حاسبة تكلفة تشطيب');
    });

    it('recommends Redesign template if business already has an active website', () => {
      const res = generateEgyptianPitchTemplates({
        businessName: 'شركة النيل للخدمات',
        category: 'Services',
        city: 'الجيزة',
        website: 'https://nile-services.eg',
        websiteStatus: 'REACHABLE',
      });
      expect(res.recommendedId).toBe('REDESIGN');
      const tmpl = res.templates.find((t) => t.id === 'REDESIGN');
      expect(tmpl?.text).toContain('تطوير الموقع');
    });
  });

  describe('Anti-Spam Dual Modes & 48h Follow-up', () => {
    it('applies permission-based closing without links in PERMISSION_BASED mode', () => {
      const res = generateEgyptianPitchTemplates({
        businessName: 'مكتب الأهرام للمحاماة',
        category: 'Law',
        city: 'الدقي',
        mode: 'PERMISSION_BASED',
        portfolioUrl: 'https://myportfolio.dev',
      });
      const lawTmpl = res.templates.find((t) => t.id === 'LAW_CONSULTING');
      expect(lawTmpl?.text).toContain('يشرفني أشارك مع حضرتك سابقة أعمالنا');
      expect(lawTmpl?.text).not.toContain('https://myportfolio.dev');
    });

    it('injects portfolio link when in DIRECT_LINK mode with provided portfolioUrl', () => {
      const res = generateEgyptianPitchTemplates({
        businessName: 'مركز الصفا لصيانة السيارات',
        category: 'Automotive',
        city: 'مدينة نصر',
        mode: 'DIRECT_LINK',
        portfolioUrl: 'https://dev-agency.eg/works',
      });
      const autoTmpl = res.templates.find((t) => t.id === 'AUTO_SERVICES');
      expect(autoTmpl?.text).toContain('https://dev-agency.eg/works');
    });

    it('includes a polite 48-hour follow-up pitch template', () => {
      const res = generateEgyptianPitchTemplates({
        businessName: 'عيادة د. سارة للجلدية',
        category: 'Medical',
        city: 'المهندسين',
      });
      const followUp = res.templates.find((t) => t.id === 'FOLLOW_UP_48H');
      expect(followUp).toBeDefined();
      expect(followUp?.isFollowUp).toBe(true);
      expect(followUp?.text).toContain('للمتابعة بخصوص مقترح تطوير الواجهة الرقمية');
      expect(followUp?.text).toContain('من يومين');
    });
  });
});
