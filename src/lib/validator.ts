import { SourceType } from '@prisma/client';
import {
  normalizeAddress,
  normalizeBusinessName,
  normalizeCategory,
  normalizeCityAndGovernorate,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizePhones,
  normalizeSocialUrl,
  normalizeSourceExternalId,
  parsePhoneDetails,
  parsePhonesDetails,
  parseSocialIdentity,
  resolveSourceType,
  calculateEstimatedBudget,
} from './normalizer';
import { ParsedPhoneInfo, PhoneLineType } from './deduplication/types';

export interface RawLeadInput {
  name?: string | null;
  businessName?: string | null;
  category?: string | null;
  governorate?: string | null;
  city?: string | null;
  area?: string | null;
  address?: string | null;
  phone?: string | null;
  phones?: (string | null | undefined)[] | string | null;
  email?: string | null;
  website?: string | null;
  websiteStatus?: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN' | null;
  facebook?: string | null;
  instagram?: string | null;
  rating?: number | string | null;
  reviewCount?: number | string | null;
  branchCount?: number | string | null;
  source?: string | null;
  sourceType?: SourceType | string | null;
  externalId?: string | number | null;
  isVerified?: boolean | null;
  isRecentlyActive?: boolean | null;
  leadType?: 'SHARED' | 'EXCLUSIVE' | null;
  maxPurchasers?: number | string | null;
  estimatedBudget?: number | string | null;
  creditCost?: number | null;
  creditCostReason?: string | null;
  isMock?: boolean | null;
}

export interface NormalizedLeadData {
  businessName: string;
  normalizedName: string;
  category: string;
  governorate: string;
  city: string;
  area: string | null;
  address: string | null;
  normalizedAddress: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  normalizedPhones: string[];
  phoneType?: PhoneLineType | null;
  phoneExtension?: string | null;
  phoneDetails?: ParsedPhoneInfo[];
  hasPhone: boolean;
  email: string | null;
  normalizedEmail: string | null;
  hasEmail: boolean;
  website: string | null;
  normalizedDomain: string | null;
  websiteStatus: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN';
  facebook: string | null;
  normalizedFacebook: string | null;
  hasFacebook: boolean;
  instagram: string | null;
  normalizedInstagram: string | null;
  hasInstagram: boolean;
  rating: number | null;
  reviewCount: number;
  branchCount: number;
  estimatedBudget: number;
  isVerified: boolean;
  isRecentlyActive: boolean;
  leadType: 'SHARED' | 'EXCLUSIVE';
  exclusive: boolean;
  maxPurchasers: number;
  source: string;
  sourceType: SourceType;
  externalId: string | null;
  creditCost?: number | null;
  creditCostReason?: string | null;
  isMock?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: NormalizedLeadData;
}

export function validateAndNormalizeLead(raw: RawLeadInput): ValidationResult {
  const errors: string[] = [];

  const rawName = (raw.businessName || raw.name || '').trim();
  if (!rawName || rawName.length < 2) {
    errors.push('اسم النشاط التجاري مطلوب ويجب أن يتكون من حرفين على الأقل.');
  }

  const normalizedName = normalizeBusinessName(rawName);
  if (!normalizedName) {
    errors.push('اسم النشاط التجاري غير صالح بعد التطبيع.');
  }

  const rawCity = (raw.city || '').trim();
  if (!rawCity) {
    errors.push('المدينة مطلوبة.');
  }

  const combinedPhonesInput: (string | null | undefined)[] = [];
  if (raw.phone) combinedPhonesInput.push(raw.phone);
  if (Array.isArray(raw.phones)) {
    combinedPhonesInput.push(...raw.phones);
  } else if (typeof raw.phones === 'string') {
    combinedPhonesInput.push(raw.phones);
  }

  const primaryPhoneDetails = parsePhoneDetails(raw.phone);
  const allPhoneDetails = parsePhonesDetails(combinedPhonesInput);
  const normalizedPhones = normalizePhones(combinedPhonesInput);
  const normalizedPhone =
    primaryPhoneDetails?.normalized || normalizePhone(raw.phone) || normalizedPhones[0] || null;

  if (raw.phone && raw.phone.trim() !== '' && !normalizedPhone) {
    errors.push('رقم الهاتف غير صالح.');
  }

  const normalizedEmail = normalizeEmail(raw.email);
  if (raw.email && raw.email.trim() !== '' && !normalizedEmail) {
    errors.push('البريد الإلكتروني غير صالح.');
  }

  let rating: number | null = null;
  if (raw.rating !== undefined && raw.rating !== null && String(raw.rating).trim() !== '') {
    const parsedRating = Number(raw.rating);
    if (Number.isNaN(parsedRating) || parsedRating < 0 || parsedRating > 5) {
      errors.push('التقييم يجب أن يكون رقمًا بين 0 و 5.');
    } else {
      rating = Math.round(parsedRating * 10) / 10;
    }
  }

  let reviewCount = 0;
  if (
    raw.reviewCount !== undefined &&
    raw.reviewCount !== null &&
    String(raw.reviewCount).trim() !== ''
  ) {
    const parsedReviews = Number(raw.reviewCount);
    if (Number.isNaN(parsedReviews) || parsedReviews < 0) {
      errors.push('عدد التقييمات يجب أن يكون رقمًا غير سالب.');
    } else {
      reviewCount = Math.floor(parsedReviews);
    }
  }

  let branchCount = 1;
  if (
    raw.branchCount !== undefined &&
    raw.branchCount !== null &&
    String(raw.branchCount).trim() !== ''
  ) {
    const parsedBranches = Number(raw.branchCount);
    if (!Number.isNaN(parsedBranches) && parsedBranches >= 1) {
      branchCount = Math.floor(parsedBranches);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const category = normalizeCategory(raw.category);
  const { city, governorate } = normalizeCityAndGovernorate(rawCity, raw.governorate);

  const normalizedDomain = normalizeDomain(raw.website);
  const cleanWebsite = normalizedDomain ? (raw.website || '').trim() : null;
  const websiteSocialIdentity =
    !normalizedDomain && raw.website ? parseSocialIdentity(raw.website) : null;

  let websiteStatus: 'NO_WEBSITE' | 'HAS_WEBSITE' | 'POOR_WEBSITE' | 'UNKNOWN' = 'NO_WEBSITE';
  if (
    raw.websiteStatus &&
    ['NO_WEBSITE', 'HAS_WEBSITE', 'POOR_WEBSITE', 'UNKNOWN'].includes(raw.websiteStatus)
  ) {
    websiteStatus = raw.websiteStatus;
  } else if (normalizedDomain) {
    websiteStatus = 'HAS_WEBSITE';
  }

  const rawFacebook =
    raw.facebook &&
    raw.facebook.trim() !== '' &&
    raw.facebook.trim().toLowerCase() !== 'none'
      ? raw.facebook.trim()
      : websiteSocialIdentity?.platform === 'FACEBOOK'
        ? raw.website!.trim()
        : null;
  const normalizedFacebook = normalizeSocialUrl(rawFacebook, 'FACEBOOK');
  const facebook = rawFacebook;

  const rawInstagram =
    raw.instagram &&
    raw.instagram.trim() !== '' &&
    raw.instagram.trim().toLowerCase() !== 'none'
      ? raw.instagram.trim()
      : websiteSocialIdentity?.platform === 'INSTAGRAM'
        ? raw.website!.trim()
        : null;
  const normalizedInstagram = normalizeSocialUrl(rawInstagram, 'INSTAGRAM');
  const instagram = rawInstagram;

  const leadType = raw.leadType === 'EXCLUSIVE' ? 'EXCLUSIVE' : 'SHARED';
  const exclusive = leadType === 'EXCLUSIVE';
  const maxPurchasers = exclusive ? 1 : Math.max(1, Number(raw.maxPurchasers) || 3);

  const estimatedBudget =
    raw.estimatedBudget && Number(raw.estimatedBudget) > 0
      ? Math.floor(Number(raw.estimatedBudget))
      : calculateEstimatedBudget({ category, reviewCount, branchCount, rating });

  const source = raw.source?.trim() || 'Manual';
  const sourceType = resolveSourceType(raw.sourceType || source);
  const externalId = normalizeSourceExternalId(raw.externalId);
  const effectivePrimaryPhoneInfo = primaryPhoneDetails || allPhoneDetails[0] || null;

  return {
    valid: true,
    errors: [],
    data: {
      businessName: rawName,
      normalizedName,
      category,
      governorate,
      city,
      area: raw.area?.trim() || null,
      address: raw.address?.trim() || null,
      normalizedAddress: normalizeAddress(raw.address),
      phone: normalizedPhone ? (raw.phone || normalizedPhone).trim() : null,
      normalizedPhone,
      normalizedPhones:
        normalizedPhones.length > 0
          ? normalizedPhones
          : normalizedPhone
            ? [normalizedPhone]
            : [],
      phoneType: effectivePrimaryPhoneInfo?.type || null,
      phoneExtension: effectivePrimaryPhoneInfo?.extension || null,
      phoneDetails: allPhoneDetails,
      hasPhone: Boolean(normalizedPhone),
      email: normalizedEmail,
      normalizedEmail,
      hasEmail: Boolean(normalizedEmail),
      website: cleanWebsite,
      normalizedDomain,
      websiteStatus,
      facebook,
      normalizedFacebook,
      hasFacebook: Boolean(facebook),
      instagram,
      normalizedInstagram,
      hasInstagram: Boolean(instagram),
      rating,
      reviewCount,
      branchCount,
      estimatedBudget,
      isVerified:
        raw.isVerified !== undefined && raw.isVerified !== null ? Boolean(raw.isVerified) : true,
      isRecentlyActive:
        raw.isRecentlyActive !== undefined && raw.isRecentlyActive !== null
          ? Boolean(raw.isRecentlyActive)
          : Boolean(facebook || instagram || reviewCount >= 10),
      leadType,
      exclusive,
      maxPurchasers,
      source,
      sourceType,
      externalId,
      isMock:
        raw.isMock !== undefined && raw.isMock !== null
          ? Boolean(raw.isMock)
          : undefined,
      creditCost:
        typeof raw.creditCost === 'number' && raw.creditCost > 0
          ? raw.creditCost
          : normalizedPhone
          ? (leadType === 'EXCLUSIVE' ? 25 : 5)
          : 1,
      creditCostReason:
        raw.creditCostReason?.trim() ||
        (normalizedPhone
          ? (leadType === 'EXCLUSIVE' ? 'EXCLUSIVE_LEAD' : 'SHARED_LEAD')
          : 'FIELD_VISIT_DISCOUNT'),
    },
  };
}
