import {
  CompletenessEvaluationResult,
  CompletenessFieldEvaluation,
  LeadQualityEvaluationInput,
} from './types';
import {
  evaluateWebsiteVerification,
  validateLeadEmail,
  validateLeadPhone,
} from './validators';

/**
 * Deterministic Data Completeness Engine (0–100).
 * Distinguishes:
 * - REQUIRED fields (60 points total):
 *   1. businessName (15 pts)
 *   2. category (10 pts)
 *   3. governorate (10 pts)
 *   4. city (10 pts)
 *   5. primaryContact (15 pts - at least one valid contact channel: phone, website, social, or email)
 * - OPTIONAL fields (40 points total):
 *   6. phone (10 pts - valid Egyptian phone)
 *   7. address / area (8 pts)
 *   8. website (6 pts)
 *   9. socialPresence (6 pts - Facebook or Instagram)
 *   10. email (5 pts - valid email)
 *   11. commercialMetrics (5 pts - rating / reviewCount / branchCount)
 * - Missing optional fields reduce completeness score proportionally without marking the lead INVALID.
 * - Missing required fields trigger `MISSING_REQUIRED_DATA`.
 */
export function evaluateLeadCompleteness(
  lead: LeadQualityEvaluationInput
): CompletenessEvaluationResult {
  const fields: CompletenessFieldEvaluation[] = [];
  const missingRequiredFields: string[] = [];
  const missingOptionalFields: string[] = [];
  const unknownFields: string[] = [];

  // 1. businessName (REQUIRED - 15 pts)
  const hasName = Boolean(lead.businessName && lead.businessName.trim().length >= 2);
  fields.push({
    field: 'businessName',
    requirement: 'REQUIRED',
    state: hasName ? 'PRESENT' : 'MISSING',
    maxPoints: 15,
    awardedPoints: hasName ? 15 : 0,
    reason: hasName ? 'Business name is present' : 'Missing required business name',
  });
  if (!hasName) missingRequiredFields.push('businessName');

  // 2. category (REQUIRED - 10 pts)
  const hasCategory = Boolean(lead.category && lead.category.trim().length > 0);
  fields.push({
    field: 'category',
    requirement: 'REQUIRED',
    state: hasCategory ? 'PRESENT' : 'MISSING',
    maxPoints: 10,
    awardedPoints: hasCategory ? 10 : 0,
    reason: hasCategory ? 'Category is present' : 'Missing required category',
  });
  if (!hasCategory) missingRequiredFields.push('category');

  // 3. governorate (REQUIRED - 10 pts)
  const hasGov = Boolean(lead.governorate && lead.governorate.trim().length > 0);
  fields.push({
    field: 'governorate',
    requirement: 'REQUIRED',
    state: hasGov ? 'PRESENT' : 'MISSING',
    maxPoints: 10,
    awardedPoints: hasGov ? 10 : 0,
    reason: hasGov ? 'Governorate is present' : 'Missing required governorate',
  });
  if (!hasGov) missingRequiredFields.push('governorate');

  // 4. city (REQUIRED - 10 pts)
  const hasCity = Boolean(lead.city && lead.city.trim().length > 0);
  fields.push({
    field: 'city',
    requirement: 'REQUIRED',
    state: hasCity ? 'PRESENT' : 'MISSING',
    maxPoints: 10,
    awardedPoints: hasCity ? 10 : 0,
    reason: hasCity ? 'City is present' : 'Missing required city',
  });
  if (!hasCity) missingRequiredFields.push('city');

  // Validate contact channels for both primaryContact (REQUIRED) and individual OPTIONAL fields
  const phoneVal = validateLeadPhone(lead.phone || lead.normalizedPhone);
  const emailVal = validateLeadEmail(lead.email || lead.normalizedEmail);
  const websiteVal = evaluateWebsiteVerification(
    lead.website,
    lead.websiteAnalysis as Record<string, unknown> | null
  );
  const hasSocial = Boolean(
    (lead.facebook && lead.facebook.trim()) ||
      lead.hasFacebook ||
      (lead.instagram && lead.instagram.trim()) ||
      lead.hasInstagram
  );
  const hasValidWebsite =
    websiteVal.state === 'WEBSITE_HTTPS' ||
    websiteVal.state === 'WEBSITE_HTTP' ||
    websiteVal.state === 'WEBSITE_EXISTS' ||
    websiteVal.state === 'WEBSITE_REDIRECT';
  const hasValidEmail =
    emailVal.status === 'DOMAIN_VALID' || emailVal.status === 'VALID_FORMAT';

  // 5. primaryContact (REQUIRED - 15 pts)
  const hasPrimaryContact =
    phoneVal.status === 'VALID' || hasValidWebsite || hasSocial || hasValidEmail;
  const hasOnlyInvalidContact =
    !hasPrimaryContact &&
    (phoneVal.status === 'INVALID' ||
      emailVal.status === 'INVALID_FORMAT' ||
      emailVal.status === 'DOMAIN_INVALID' ||
      websiteVal.state === 'DOMAIN_INVALID' ||
      websiteVal.state === 'WEBSITE_UNREACHABLE');

  fields.push({
    field: 'primaryContact',
    requirement: 'REQUIRED',
    state: hasPrimaryContact ? 'PRESENT' : hasOnlyInvalidContact ? 'INVALID' : 'MISSING',
    maxPoints: 15,
    awardedPoints: hasPrimaryContact ? 15 : 0,
    reason: hasPrimaryContact
      ? 'At least one valid contact channel is present'
      : hasOnlyInvalidContact
      ? 'Provided contact channels are invalid'
      : 'No contact channel (phone, website, social, or email) provided',
  });
  if (!hasPrimaryContact) missingRequiredFields.push('primaryContact');

  // 6. phone (OPTIONAL - 10 pts)
  if (phoneVal.status === 'VALID') {
    fields.push({
      field: 'phone',
      requirement: 'OPTIONAL',
      state: 'PRESENT',
      maxPoints: 10,
      awardedPoints: 10,
      reason: phoneVal.reason,
    });
  } else if (phoneVal.status === 'INVALID') {
    fields.push({
      field: 'phone',
      requirement: 'OPTIONAL',
      state: 'INVALID',
      maxPoints: 10,
      awardedPoints: 0,
      reason: phoneVal.reason,
    });
    missingOptionalFields.push('phone');
  } else {
    fields.push({
      field: 'phone',
      requirement: 'OPTIONAL',
      state: 'MISSING',
      maxPoints: 10,
      awardedPoints: 0,
      reason: 'Phone number not provided',
    });
    missingOptionalFields.push('phone');
  }

  // 7. address / area (OPTIONAL - 8 pts)
  const hasAddress = Boolean(lead.address && lead.address.trim().length >= 3);
  const hasArea = Boolean(lead.area && lead.area.trim().length >= 2);
  const addressPts = hasAddress && hasArea ? 8 : hasAddress ? 6 : hasArea ? 4 : 0;
  fields.push({
    field: 'address',
    requirement: 'OPTIONAL',
    state: addressPts > 0 ? 'PRESENT' : 'MISSING',
    maxPoints: 8,
    awardedPoints: addressPts,
    reason:
      addressPts === 8
        ? 'Both street address and area are present'
        : addressPts === 6
        ? 'Street address is present'
        : addressPts === 4
        ? 'Area is present (street address missing)'
        : 'Address and area are missing',
  });
  if (addressPts === 0) missingOptionalFields.push('address');

  // 8. website (OPTIONAL - 6 pts)
  if (hasValidWebsite) {
    fields.push({
      field: 'website',
      requirement: 'OPTIONAL',
      state: 'PRESENT',
      maxPoints: 6,
      awardedPoints: 6,
      reason: websiteVal.reason,
    });
  } else if (
    websiteVal.state === 'DOMAIN_INVALID' ||
    websiteVal.state === 'WEBSITE_UNREACHABLE'
  ) {
    fields.push({
      field: 'website',
      requirement: 'OPTIONAL',
      state: 'INVALID',
      maxPoints: 6,
      awardedPoints: 0,
      reason: websiteVal.reason,
    });
    missingOptionalFields.push('website');
  } else {
    fields.push({
      field: 'website',
      requirement: 'OPTIONAL',
      state: 'MISSING',
      maxPoints: 6,
      awardedPoints: 0,
      reason: 'No website provided (optional)',
    });
    missingOptionalFields.push('website');
  }

  // 9. socialPresence (OPTIONAL - 6 pts)
  fields.push({
    field: 'socialPresence',
    requirement: 'OPTIONAL',
    state: hasSocial ? 'PRESENT' : 'MISSING',
    maxPoints: 6,
    awardedPoints: hasSocial ? 6 : 0,
    reason: hasSocial
      ? 'Social media presence (Facebook or Instagram) is recorded'
      : 'No social media presence recorded (optional)',
  });
  if (!hasSocial) missingOptionalFields.push('socialPresence');

  // 10. email (OPTIONAL - 5 pts)
  if (hasValidEmail) {
    fields.push({
      field: 'email',
      requirement: 'OPTIONAL',
      state: 'PRESENT',
      maxPoints: 5,
      awardedPoints: 5,
      reason: emailVal.reason,
    });
  } else if (
    emailVal.status === 'INVALID_FORMAT' ||
    emailVal.status === 'DOMAIN_INVALID'
  ) {
    fields.push({
      field: 'email',
      requirement: 'OPTIONAL',
      state: 'INVALID',
      maxPoints: 5,
      awardedPoints: 0,
      reason: emailVal.reason,
    });
    missingOptionalFields.push('email');
  } else {
    fields.push({
      field: 'email',
      requirement: 'OPTIONAL',
      state: 'MISSING',
      maxPoints: 5,
      awardedPoints: 0,
      reason: 'No email provided (optional)',
    });
    missingOptionalFields.push('email');
  }

  // 11. commercialMetrics (OPTIONAL - 3 pts)
  const hasRating = typeof lead.rating === 'number' && lead.rating > 0;
  const hasReviews = typeof lead.reviewCount === 'number' && lead.reviewCount > 0;
  const hasMultiBranch = typeof lead.branchCount === 'number' && lead.branchCount > 1;
  const metricsPts = hasRating && hasReviews ? 3 : hasRating || hasReviews || hasMultiBranch ? 2 : 0;
  fields.push({
    field: 'commercialMetrics',
    requirement: 'OPTIONAL',
    state: metricsPts > 0 ? 'PRESENT' : 'UNKNOWN',
    maxPoints: 3,
    awardedPoints: metricsPts,
    reason:
      metricsPts > 0
        ? 'Commercial reputation/scale metrics are present'
        : 'Commercial reputation metrics are unknown',
  });
  if (metricsPts === 0) unknownFields.push('commercialMetrics');

  // 12. source (OPTIONAL - 2 pts)
  const hasSource = Boolean(
    (lead.source && lead.source.trim().length > 0) ||
      (Array.isArray(lead.sourceList) && lead.sourceList.some((s) => Boolean(s && s.trim())))
  );
  fields.push({
    field: 'source',
    requirement: 'OPTIONAL',
    state: hasSource ? 'PRESENT' : 'UNKNOWN',
    maxPoints: 2,
    awardedPoints: hasSource ? 2 : 0,
    reason: hasSource
      ? 'Source provenance is recorded'
      : 'Source provenance is unknown',
  });
  if (!hasSource) {
    missingOptionalFields.push('source');
    unknownFields.push('source');
  }

  const requiredScore = fields
    .filter((f) => f.requirement === 'REQUIRED')
    .reduce((sum, f) => sum + f.awardedPoints, 0);
  const requiredMax = fields
    .filter((f) => f.requirement === 'REQUIRED')
    .reduce((sum, f) => sum + f.maxPoints, 0);

  const optionalScore = fields
    .filter((f) => f.requirement === 'OPTIONAL')
    .reduce((sum, f) => sum + f.awardedPoints, 0);
  const optionalMax = fields
    .filter((f) => f.requirement === 'OPTIONAL')
    .reduce((sum, f) => sum + f.maxPoints, 0);

  const completenessScore = Math.max(
    0,
    Math.min(100, Math.round(requiredScore + optionalScore))
  );

  return {
    completenessScore,
    requiredScore,
    requiredMax,
    optionalScore,
    optionalMax,
    missingRequiredFields,
    missingOptionalFields,
    unknownFields,
    fields,
  };
}
