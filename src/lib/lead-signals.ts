import { localizeQualificationReason } from './taxonomy';

export interface ScorableLeadSignalsInput {
  qualificationReasons?: string[] | null;
  websiteStatus?: string | null;
  website?: string | null;
  hasPhone?: boolean | null;
  phone?: string | null;
  phoneValidationStatus?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  hasFacebook?: boolean | null;
  facebook?: string | null;
}

/**
 * Derives up to 3 high-impact, truthful scoring signals for a lead.
 *
 * Source fields and conditions:
 * 1. `lead.qualificationReasons` (string[]):
 *    - Present & non-empty -> parsed and localized directly via `localizeQualificationReason`.
 *
 * Fallback signals (derived when qualificationReasons is absent/empty):
 * 2. Website:
 *    - `lead.websiteStatus === 'NO_WEBSITE'` or missing website -> "No website" / "لا يوجد موقع"
 *    - `lead.websiteStatus === 'POOR_WEBSITE'` -> "Poor website" / "موقع ضعيف"
 * 3. Phone (Truthful distinction):
 *    - `lead.phoneValidationStatus === 'VALID'` -> "Validated phone" / "هاتف مفحوص"
 *    - `lead.hasPhone === true` or non-empty `lead.phone` (without VALID status) -> "Phone available" / "هاتف متاح"
 *    - `lead.hasPhone === false` and no `lead.phone` -> omitted completely (no false claims)
 * 4. Reputation / Reviews:
 *    - `lead.rating >= 4.0` -> "★ {rating} Google" / "★ {rating} تقييم جوجل"
 *    - else if `lead.reviewCount >= 10` -> "{count}+ reviews" / "{count}+ تقييم"
 * 5. Social:
 *    - `lead.hasFacebook === true` or non-empty `lead.facebook` -> "Active Facebook" / "فيسبوك نشط"
 */
export function getEffectiveLeadSignals(
  lead: ScorableLeadSignalsInput,
  locale: string = 'ar'
): string[] {
  if (lead.qualificationReasons && lead.qualificationReasons.length > 0) {
    const localized = lead.qualificationReasons
      .map((r) => localizeQualificationReason(r, locale))
      .filter(Boolean);
    if (localized.length > 0) return localized.slice(0, 3);
  }

  const derived: string[] = [];

  // Website status signal
  if (lead.websiteStatus === 'NO_WEBSITE' || !lead.website) {
    derived.push(locale === 'en' ? 'No website' : 'لا يوجد موقع');
  } else if (lead.websiteStatus === 'POOR_WEBSITE') {
    derived.push(locale === 'en' ? 'Poor website' : 'موقع ضعيف');
  }

  // Phone signal: Truthful labeling (Phone available vs Validated phone)
  if (lead.phoneValidationStatus === 'VALID') {
    derived.push(locale === 'en' ? 'Validated phone' : 'هاتف مفحوص');
  } else if (lead.hasPhone || (lead.phone && lead.phone.trim().length > 0)) {
    derived.push(locale === 'en' ? 'Phone available' : 'هاتف متاح');
  }

  // Google Rating / Reviews signal
  if (typeof lead.rating === 'number' && lead.rating >= 4.0) {
    derived.push(locale === 'en' ? `★ ${lead.rating} Google` : `★ ${lead.rating} تقييم جوجل`);
  } else if (typeof lead.reviewCount === 'number' && lead.reviewCount >= 10) {
    derived.push(locale === 'en' ? `${lead.reviewCount}+ reviews` : `${lead.reviewCount}+ تقييم`);
  }

  // Social presence signal
  if (lead.hasFacebook || (lead.facebook && lead.facebook.trim().length > 0)) {
    derived.push(locale === 'en' ? 'Active Facebook' : 'فيسبوك نشط');
  }

  return derived.slice(0, 3);
}
