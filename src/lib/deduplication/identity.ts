import { SourceType } from '@prisma/client';
import { NormalizedLeadData } from '../validator';
import {
  normalizeAddress,
  normalizeBusinessName,
  normalizeCityAndGovernorate,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizePhones,
  normalizeSocialUrl,
  normalizeSourceExternalId,
  resolveSourceType,
} from './normalizer';
import { CanonicalIdentityKeyRecord, IdentityKeyType } from './types';

export interface IdentityKeyInput {
  businessName?: string | null;
  normalizedName?: string | null;
  city?: string | null;
  address?: string | null;
  normalizedAddress?: string | null;
  phone?: string | null;
  normalizedPhone?: string | null;
  phones?: (string | null | undefined)[] | null;
  normalizedPhones?: string[] | null;
  email?: string | null;
  normalizedEmail?: string | null;
  website?: string | null;
  normalizedDomain?: string | null;
  facebook?: string | null;
  normalizedFacebook?: string | null;
  instagram?: string | null;
  normalizedInstagram?: string | null;
  source?: string | null;
  sourceType?: SourceType | string | null;
  externalId?: string | number | null;
}

export interface GeneratedIdentityKeys {
  records: CanonicalIdentityKeyRecord[];
  strongKeys: string[];
  compositeKeys: string[];
  allKeys: string[];
}

export function formatSourceKey(sourceType: string, externalId: string): string {
  return `SOURCE:${sourceType.toUpperCase()}:${externalId}`;
}

export function formatDomainKey(normalizedDomain: string): string {
  return `DOMAIN:${normalizedDomain}`;
}

export function formatPhoneKey(normalizedPhone: string): string {
  return `PHONE:${normalizedPhone}`;
}

export function formatEmailKey(normalizedEmail: string): string {
  return `EMAIL:${normalizedEmail}`;
}

export function formatSocialKey(normalizedSocialUrl: string): string {
  return `SOCIAL:${normalizedSocialUrl}`;
}

export function formatNameCityKey(normalizedName: string, normalizedCity: string): string {
  return `NAME:${normalizedName}:CITY:${normalizedCity}`;
}

export function formatNameAddressCityKey(
  normalizedName: string,
  normalizedAddress: string,
  normalizedCity: string
): string {
  return `NAME:${normalizedName}:ADDRESS:${normalizedAddress}:CITY:${normalizedCity}`;
}

/**
 * Generates all deterministic Canonical Identity Keys for a normalized or raw lead record.
 */
export function generateCanonicalIdentityKeys(
  input: IdentityKeyInput | NormalizedLeadData
): GeneratedIdentityKeys {
  const records: CanonicalIdentityKeyRecord[] = [];
  const seen = new Set<string>();

  const addKey = (
    keyType: IdentityKeyType,
    keyValue: string,
    canonicalKey: string,
    isPrimary: boolean,
    isStrong: boolean
  ) => {
    if (!keyValue || !canonicalKey || seen.has(canonicalKey)) return;
    seen.add(canonicalKey);
    records.push({
      keyType,
      keyValue,
      canonicalKey,
      isPrimary,
      isStrong,
    });
  };

  // 1. Source External ID
  const externalId = normalizeSourceExternalId(input.externalId);
  const sourceType = resolveSourceType(input.sourceType || input.source);
  if (externalId) {
    const val = `${sourceType}:${externalId}`;
    addKey('SOURCE', val, formatSourceKey(sourceType, externalId), true, true);
  }

  // 2. Domain
  const domain = input.normalizedDomain || normalizeDomain(input.website);
  if (domain) {
    addKey('DOMAIN', domain, formatDomainKey(domain), true, true);
  }

  // 3. Phones (Primary + Multi-valued)
  const primaryPhone = input.normalizedPhone || normalizePhone(input.phone);
  const allPhones = new Set<string>();
  if (primaryPhone) allPhones.add(primaryPhone);
  if (Array.isArray(input.normalizedPhones)) {
    for (const p of input.normalizedPhones) {
      if (p) allPhones.add(p);
    }
  }
  if ('phones' in input && Array.isArray(input.phones)) {
    for (const p of normalizePhones(input.phones)) {
      allPhones.add(p);
    }
  }
  if (input.phone) {
    for (const p of normalizePhones(input.phone)) {
      allPhones.add(p);
    }
  }

  let phoneIdx = 0;
  for (const p of allPhones) {
    addKey('PHONE', p, formatPhoneKey(p), phoneIdx === 0, true);
    phoneIdx += 1;
  }

  // 4. Email
  const email = input.normalizedEmail || normalizeEmail(input.email);
  if (email) {
    addKey('EMAIL', email, formatEmailKey(email), true, true);
  }

  // 5. Social URLs
  const fb = input.normalizedFacebook || normalizeSocialUrl(input.facebook, 'FACEBOOK');
  if (fb) {
    addKey('SOCIAL', fb, formatSocialKey(fb), true, true);
  }
  const ig = input.normalizedInstagram || normalizeSocialUrl(input.instagram, 'INSTAGRAM');
  if (ig) {
    addKey('SOCIAL', ig, formatSocialKey(ig), !fb, true);
  }

  // 6. Composite Identity Keys (Name + City, Name + Address + City)
  const normName = input.normalizedName || normalizeBusinessName(input.businessName);
  const rawCity = input.city || '';
  const normCity = rawCity ? normalizeCityAndGovernorate(rawCity).city : '';
  const normAddr = input.normalizedAddress || normalizeAddress(input.address);

  if (normName && normCity) {
    addKey(
      'COMPOSITE_NAME_CITY',
      `${normName}|${normCity}`,
      formatNameCityKey(normName, normCity),
      false,
      false
    );
    if (normAddr) {
      addKey(
        'COMPOSITE_NAME_ADDRESS_CITY',
        `${normName}|${normAddr}|${normCity}`,
        formatNameAddressCityKey(normName, normAddr, normCity),
        false,
        false
      );
    }
  }

  const strongKeys = records.filter((r) => r.isStrong).map((r) => r.canonicalKey);
  const compositeKeys = records.filter((r) => !r.isStrong).map((r) => r.canonicalKey);
  const allKeys = records.map((r) => r.canonicalKey);

  return {
    records,
    strongKeys,
    compositeKeys,
    allKeys,
  };
}
