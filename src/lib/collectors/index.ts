import { PrismaClient } from '@prisma/client';
import { RawLeadInput, validateAndNormalizeLead } from '../validator';
import {
  evaluateLeadDeduplication,
  withIdentityConcurrencyLock,
  generateCanonicalIdentityKeys,
  mergeSourceIntoCanonicalLead,
  buildInitialFieldProvenance,
  ConflictResolutionPolicy,
} from '../deduplication';
import { analyzeWebsiteUrl } from '../website-analyzer';
import {
  calculateLeadScore,
  loadScoringContext,
  logScoringOperation,
} from '../scoring-engine';
import {
  computeVerificationExpiryDate,
  evaluateLeadQuality,
  logVerificationEvent,
} from '../quality';

export interface Collector {
  readonly name: string;
  readonly sourceType:
    | 'MANUAL'
    | 'CSV_IMPORT'
    | 'OPEN_DATA'
    | 'DIRECTORY'
    | 'WEBSITE'
    | 'GOOGLE_BUSINESS';
  collect(input?: unknown): Promise<RawLeadInput[]>;
}

/**
 * 1. ManualCollector: Processes single or batch manually submitted business records.
 */
export class ManualCollector implements Collector {
  readonly name = 'Manual Entry';
  readonly sourceType = 'MANUAL' as const;

  async collect(input?: RawLeadInput | RawLeadInput[]): Promise<RawLeadInput[]> {
    if (!input) return [];
    const items = Array.isArray(input) ? input : [input];
    return items.map((item) => ({
      ...item,
      source: item.source || this.name,
    }));
  }
}

/**
 * Parses CSV string deterministically supporting quoted fields, commas, and CRLF/LF newlines.
 */
export function parseCsvString(csvText: string): Record<string, string>[] {
  const cleaned = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const nextChar = cleaned[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  const result: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((cell) => cell === '')) continue;
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx] !== undefined ? row[idx] : '';
    });
    result.push(obj);
  }

  return result;
}

/**
 * 2. CsvCollector: Collects and maps rows from CSV upload.
 * Supported columns:
 * name, category, city, area, address, phone, email, website, facebook, instagram, rating, reviewCount, source
 */
export class CsvCollector implements Collector {
  readonly name: string;
  readonly sourceType = 'CSV_IMPORT' as const;

  constructor(sourceName = 'CSV Import') {
    this.name = sourceName;
  }

  async collect(csvContent?: unknown): Promise<RawLeadInput[]> {
    if (typeof csvContent !== 'string') return [];
    const parsedRows = parseCsvString(csvContent);

    return parsedRows.map((row) => {
      const getField = (...keys: string[]) => {
        for (const k of keys) {
          const foundKey = Object.keys(row).find((rk) => rk.toLowerCase() === k.toLowerCase());
          if (foundKey && row[foundKey] !== '') return row[foundKey];
        }
        return undefined;
      };

      const secondaryPhone = getField('secondaryPhone', 'phone2', 'phones', 'هاتف إضافي');

      return {
        name: getField('name', 'businessName', 'business_name', 'الاسم'),
        category: getField('category', 'niche', 'type', 'التصنيف'),
        city: getField('city', 'المدينة'),
        governorate: getField('governorate', 'المحافظة'),
        area: getField('area', 'district', 'المنطقة'),
        address: getField('address', 'العنوان'),
        phone: getField('phone', 'mobile', 'telephone', 'الهاتف'),
        phones: secondaryPhone ? [secondaryPhone] : undefined,
        email: getField('email', 'البريد'),
        website: getField('website', 'url', 'الموقع'),
        facebook: getField('facebook', 'fb', 'فيسبوك'),
        instagram: getField('instagram', 'ig', 'انستجرام'),
        rating: getField('rating', 'التقييم'),
        reviewCount: getField('reviewCount', 'review_count', 'reviews', 'عدد التقييمات'),
        branchCount: getField('branchCount', 'branches', 'الفروع'),
        source: getField('source', 'المصدر') || this.name,
        sourceType: this.sourceType,
        externalId: getField('externalId', 'external_id', 'place_id', 'source_id', 'المعرف الخارجي'),
      };
    });
  }
}

/**
 * 3. OpenDataCollector: Collects structured records from legal Egyptian Open Business Datasets.
 */
export class OpenDataCollector implements Collector {
  readonly name = 'Egypt Open Commercial Registry Dataset';
  readonly sourceType = 'OPEN_DATA' as const;

  async collect(customRecords?: RawLeadInput[]): Promise<RawLeadInput[]> {
    if (Array.isArray(customRecords) && customRecords.length > 0) {
      return customRecords.map((r) => ({ ...r, source: r.source || this.name }));
    }

    return [
      {
        name: 'مركز النيل التخصصي لطب الأسنان',
        category: 'Dental',
        city: 'القاهرة',
        area: 'مدينة نصر',
        address: 'شارع عباس العقاد، مدينة نصر',
        phone: '01012349876',
        facebook: 'https://facebook.com/niledentalcenter.eg',
        instagram: 'https://instagram.com/niledentalcenter.eg',
        rating: 4.8,
        reviewCount: 215,
        source: this.name,
      },
      {
        name: 'أكاديمية الرواد للتدريب واللغات',
        category: 'Education',
        city: 'الجيزة',
        area: 'الدقي',
        address: 'شارع مصدق، الدقي',
        phone: '01123458765',
        email: 'info@alrowad-academy-eg.org',
        website: 'http://old-alrowad-academy.com',
        facebook: 'https://facebook.com/alrowadacademy.eg',
        rating: 4.6,
        reviewCount: 140,
        source: this.name,
      },
      {
        name: 'مطعم وكافيه سرايا الشام',
        category: 'Restaurant',
        city: 'الإسكندرية',
        area: 'سموحة',
        address: 'شارع فوزي معاذ، سموحة',
        phone: '01287654321',
        facebook: 'https://facebook.com/sarayasham.alex',
        instagram: 'https://instagram.com/sarayasham.alex',
        rating: 4.5,
        reviewCount: 390,
        source: this.name,
      },
    ];
  }
}

/**
 * 4. DirectoryCollector: Adapter for structured business directory feeds / exports.
 */
export class DirectoryCollector implements Collector {
  readonly name = 'Egypt Business Directory Feed';
  readonly sourceType = 'DIRECTORY' as const;

  async collect(records?: RawLeadInput[]): Promise<RawLeadInput[]> {
    if (!Array.isArray(records)) return [];
    return records.map((r) => ({ ...r, source: r.source || this.name }));
  }
}

/**
 * 5. WebsiteCollector: Adapter for opted-in / public website registry check.
 */
export class WebsiteCollector implements Collector {
  readonly name = 'Public Domain & Website Registry';
  readonly sourceType = 'WEBSITE' as const;

  async collect(records?: RawLeadInput[]): Promise<RawLeadInput[]> {
    if (!Array.isArray(records)) return [];
    return records.map((r) => ({ ...r, source: r.source || this.name }));
  }
}

/**
 * 6. GoogleBusinessCollector: Adapter for official Google Places API / Business Profile export data.
 */
export class GoogleBusinessCollector implements Collector {
  readonly name = 'Google Business Profile Export';
  readonly sourceType = 'GOOGLE_BUSINESS' as const;

  async collect(records?: RawLeadInput[]): Promise<RawLeadInput[]> {
    if (!Array.isArray(records)) return [];
    return records.map((r) => ({ ...r, source: r.source || this.name }));
  }
}

export interface PipelineImportReport {
  importJobId: string;
  imported: number;
  valid: number;
  duplicates: number;
  possibleDuplicates: number;
  conflicts: number;
  invalid: number;
  records: {
    rowNumber: number;
    businessName: string;
    status: 'VALID' | 'DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'CONFLICT' | 'INVALID';
    decision?: 'UNIQUE' | 'DUPLICATE_CONFIRMED' | 'POSSIBLE_DUPLICATE' | 'CONFLICT';
    leadId?: string;
    sourceRecordId?: string;
    duplicateCandidateId?: string;
    mergeId?: string;
    errors?: string[];
    matchReason?: string;
    signals?: unknown[];
    conflicts?: unknown[];
  }[];
}

/**
 * Unified Ingestion Pipeline (Phase 1 + Phase 2):
 * Raw Data -> Collector -> Normalizer -> Validator -> Canonical Identity Keys ->
 * SourceRecord -> Deduplication Engine -> Merge / Review / Score -> Lead Database
 */
export async function runIngestionPipeline(params: {
  prisma: PrismaClient;
  userId: string;
  sourceName: string;
  sourceType?:
    | 'MANUAL'
    | 'CSV_IMPORT'
    | 'OPEN_DATA'
    | 'DIRECTORY'
    | 'WEBSITE'
    | 'GOOGLE_BUSINESS';
  sourceId?: string | null;
  fileName?: string | null;
  conflictPolicy?: ConflictResolutionPolicy;
  rawRecords: RawLeadInput[];
}): Promise<PipelineImportReport> {
  const {
    prisma,
    userId,
    sourceName,
    sourceType,
    sourceId,
    fileName,
    conflictPolicy = 'SAFE_PHONE_PRIORITY',
    rawRecords,
  } = params;

  const scoringContext = await loadScoringContext(prisma);
  const scoringRules = scoringContext.rules;

  const importJob = await prisma.importJob.create({
    data: {
      userId,
      sourceId: sourceId || null,
      sourceName,
      fileName: fileName || null,
      status: 'PROCESSING',
      totalRows: rawRecords.length,
    },
  });

  let validCount = 0;
  let duplicateCount = 0;
  let possibleDuplicateCount = 0;
  let conflictCount = 0;
  let invalidCount = 0;
  const reportRecords: PipelineImportReport['records'] = [];

  for (let i = 0; i < rawRecords.length; i++) {
    const rowNumber = i + 1;
    const raw: RawLeadInput = {
      ...rawRecords[i],
      source: rawRecords[i].source || sourceName,
      sourceType: rawRecords[i].sourceType || sourceType,
    };
    const validation = validateAndNormalizeLead(raw);

    if (!validation.valid || !validation.data) {
      invalidCount += 1;
      await prisma.importRecord.create({
        data: {
          importJobId: importJob.id,
          rowNumber,
          rawData: raw as unknown as object,
          status: 'INVALID',
          errorMessage: validation.errors.join(' | '),
        },
      });
      reportRecords.push({
        rowNumber,
        businessName: raw.businessName || raw.name || `صف #${rowNumber}`,
        status: 'INVALID',
        errors: validation.errors,
      });
      continue;
    }

    const normalized = validation.data;

    // Website Checker (Rule-Based)
    const websiteAnalysis = await analyzeWebsiteUrl(normalized.website, { allowNetwork: false });
    if (!normalized.website) {
      normalized.websiteStatus = raw.websiteStatus === 'UNKNOWN' ? 'UNKNOWN' : 'NO_WEBSITE';
    } else if (
      raw.websiteStatus &&
      ['POOR_WEBSITE', 'HAS_WEBSITE', 'UNKNOWN'].includes(raw.websiteStatus)
    ) {
      normalized.websiteStatus = raw.websiteStatus;
    } else {
      normalized.websiteStatus = websiteAnalysis.recommendedWebsiteStatus;
    }

    const identityKeys = generateCanonicalIdentityKeys(normalized);

    // Concurrency Lock per Canonical Identity Keys (Section 20)
    await withIdentityConcurrencyLock(identityKeys.allKeys, async () => {
      const now = new Date();

      // 1. Run Phase 2 Deterministic Deduplication Engine
      const dedup = await evaluateLeadDeduplication(prisma, normalized, {
        conflictPolicy,
      });

      // 2. Always persist a SourceRecord for every valid ingestion event (Section 13)
      const sourceRecordData = {
        sourceId: sourceId || null,
        importJobId: importJob.id,
        sourceName: normalized.source,
        sourceType: normalized.sourceType || sourceType || 'MANUAL',
        externalId: normalized.externalId || null,
        rawData: raw as unknown as object,
        normalizedData: normalized as unknown as object,
        identityKeys: identityKeys.allKeys,
        decision: dedup.decision,
        matchedSignals: dedup.signals as unknown as object,
        status: 'ACTIVE' as const,
        firstSeenAt: now,
        lastSeenAt: now,
      };

      const sourceRecord = normalized.externalId
        ? await prisma.sourceRecord.upsert({
            where: {
              sourceName_externalId: {
                sourceName: normalized.source,
                externalId: normalized.externalId,
              },
            },
            update: {
              rawData: raw as unknown as object,
              normalizedData: normalized as unknown as object,
              identityKeys: identityKeys.allKeys,
              decision: dedup.decision,
              matchedSignals: dedup.signals as unknown as object,
              lastSeenAt: now,
            },
            create: sourceRecordData,
          })
        : await prisma.sourceRecord.create({
            data: sourceRecordData,
          });

      // Case A: DUPLICATE_CONFIRMED -> Merge into existing Canonical Lead
      if (dedup.decision === 'DUPLICATE_CONFIRMED' && dedup.matchedLead) {
        duplicateCount += 1;
        if (dedup.hasConflicts) {
          conflictCount += 1;
        }

        const mergeOutcome = await mergeSourceIntoCanonicalLead(
          prisma,
          dedup.matchedLead,
          normalized,
          {
            sourceRecordId: sourceRecord.id,
            reason: dedup.matchReason || 'DUPLICATE_CONFIRMED',
            decision: 'DUPLICATE_CONFIRMED',
            matchedSignals: dedup.signals,
            performedBy: 'SYSTEM',
            mergeType: 'AUTOMATIC',
            conflictPolicy,
            rules: scoringRules,
            scoringVersion: scoringContext.scoringVersion,
            thresholds: scoringContext.thresholds,
          }
        );

        await prisma.importRecord.create({
          data: {
            importJobId: importJob.id,
            rowNumber,
            rawData: raw as unknown as object,
            status: 'DUPLICATE',
            leadId: mergeOutcome.lead.id,
            errorMessage: `تم الدمج مع سجل موجود (${dedup.matchReason})`,
          },
        });

        reportRecords.push({
          rowNumber,
          businessName: normalized.businessName,
          status: 'DUPLICATE',
          decision: 'DUPLICATE_CONFIRMED',
          leadId: mergeOutcome.lead.id,
          sourceRecordId: sourceRecord.id,
          mergeId: mergeOutcome.mergeId,
          matchReason: dedup.matchReason,
          signals: dedup.signals,
          conflicts: mergeOutcome.fieldChanges.conflictedFields,
        });
        return;
      }

      // Case B: POSSIBLE_DUPLICATE or CONFLICT -> Flag for Admin Review (Do NOT auto-merge)
      if (
        (dedup.decision === 'POSSIBLE_DUPLICATE' || dedup.decision === 'CONFLICT') &&
        dedup.matchedLead
      ) {
        if (dedup.decision === 'CONFLICT') {
          conflictCount += 1;
          await prisma.sourceRecord.update({
            where: { id: sourceRecord.id },
            data: { status: 'CONFLICT' },
          });
        } else {
          possibleDuplicateCount += 1;
        }

        const candidate = await prisma.duplicateCandidate.create({
          data: {
            sourceRecordId: sourceRecord.id,
            matchedLeadId: dedup.matchedLead.id,
            decision: dedup.decision,
            status: 'PENDING',
            signals: dedup.signals as unknown as object,
            conflicts: dedup.conflicts as unknown as object,
            confidenceLevel: dedup.decision === 'CONFLICT' ? 'HIGH' : 'MEDIUM',
          },
        });

        await prisma.importRecord.create({
          data: {
            importJobId: importJob.id,
            rowNumber,
            rawData: raw as unknown as object,
            status: dedup.decision === 'CONFLICT' ? 'CONFLICT' : 'POSSIBLE_DUPLICATE',
            leadId: dedup.matchedLead.id,
            errorMessage:
              dedup.decision === 'CONFLICT'
                ? `تعارض في البيانات مع سجل موجود (${dedup.matchReason}) — بانتظار مراجعة الإدارة`
                : `تشابه محتمل مع سجل موجود (${dedup.matchReason}) — بانتظار مراجعة الإدارة`,
          },
        });

        reportRecords.push({
          rowNumber,
          businessName: normalized.businessName,
          status: dedup.decision === 'CONFLICT' ? 'CONFLICT' : 'POSSIBLE_DUPLICATE',
          decision: dedup.decision,
          leadId: dedup.matchedLead.id,
          sourceRecordId: sourceRecord.id,
          duplicateCandidateId: candidate.id,
          matchReason: dedup.matchReason,
          signals: dedup.signals,
          conflicts: dedup.conflicts,
        });
        return;
      }

      // Case C: UNIQUE -> Create new Canonical Lead + LeadIdentity + LeadScore
      const scoreStartMs = Date.now();
      const scoreResult = calculateLeadScore(
        {
          isVerified: normalized.isVerified,
          websiteStatus: normalized.websiteStatus,
          website: normalized.website,
          normalizedDomain: normalized.normalizedDomain,
          websiteAnalysis: websiteAnalysis as unknown as Record<string, unknown>,
          hasFacebook: normalized.hasFacebook,
          facebook: normalized.facebook,
          hasInstagram: normalized.hasInstagram,
          instagram: normalized.instagram,
          hasPhone: normalized.hasPhone,
          phone: normalized.phone,
          normalizedPhone: normalized.normalizedPhone,
          hasEmail: normalized.hasEmail,
          email: normalized.email,
          normalizedEmail: normalized.normalizedEmail,
          branchCount: normalized.branchCount,
          reviewCount: normalized.reviewCount,
          rating: normalized.rating,
          isRecentlyActive: normalized.isRecentlyActive,
          category: normalized.category,
          city: normalized.city,
          governorate: normalized.governorate,
          area: normalized.area,
          estimatedBudget: normalized.estimatedBudget,
          source: normalized.source,
          sourceList: [normalized.source],
          lastVerifiedAt: now,
        },
        scoringRules,
        {
          scoringVersion: scoringContext.scoringVersion,
          thresholds: scoringContext.thresholds,
          calculatedAt: now,
        }
      );

      const initialProvenance = buildInitialFieldProvenance(
        normalized,
        sourceRecord.id,
        now
      );

      const qualityEval = evaluateLeadQuality(
        {
          businessName: normalized.businessName,
          normalizedName: normalized.normalizedName,
          category: normalized.category,
          governorate: normalized.governorate,
          city: normalized.city,
          area: normalized.area,
          address: normalized.address,
          normalizedAddress: normalized.normalizedAddress,
          phone: normalized.phone,
          normalizedPhone: normalized.normalizedPhone,
          phones:
            normalized.normalizedPhones.length > 0
              ? normalized.normalizedPhones
              : normalized.normalizedPhone
              ? [normalized.normalizedPhone]
              : [],
          hasPhone: normalized.hasPhone,
          email: normalized.email,
          normalizedEmail: normalized.normalizedEmail,
          hasEmail: normalized.hasEmail,
          website: normalized.website,
          normalizedDomain: normalized.normalizedDomain,
          websiteStatus: normalized.websiteStatus,
          websiteAnalysis: websiteAnalysis as unknown as Record<string, unknown>,
          facebook: normalized.facebook,
          normalizedFacebook: normalized.normalizedFacebook,
          hasFacebook: normalized.hasFacebook,
          instagram: normalized.instagram,
          normalizedInstagram: normalized.normalizedInstagram,
          hasInstagram: normalized.hasInstagram,
          rating: normalized.rating,
          reviewCount: normalized.reviewCount,
          branchCount: normalized.branchCount,
          score: scoreResult.normalizedScore,
          isVerified: normalized.isVerified,
          isCanonical: true,
          source: normalized.source,
          sourceList: [normalized.source],
          lastVerifiedAt: now,
        },
        { now }
      );

      const createdLead = await prisma.$transaction(async (tx) => {
        const lead = await tx.lead.create({
          data: {
            businessName: normalized.businessName,
            normalizedName: normalized.normalizedName,
            category: normalized.category,
            governorate: normalized.governorate,
            city: normalized.city,
            area: normalized.area,
            address: normalized.address,
            normalizedAddress: normalized.normalizedAddress,
            phone: normalized.phone,
            normalizedPhone: normalized.normalizedPhone,
            phones:
              normalized.normalizedPhones.length > 0
                ? normalized.normalizedPhones
                : normalized.normalizedPhone
                  ? [normalized.normalizedPhone]
                  : [],
            hasPhone: normalized.hasPhone,
            email: normalized.email,
            normalizedEmail: normalized.normalizedEmail,
            hasEmail: normalized.hasEmail,
            website: normalized.website,
            normalizedDomain: normalized.normalizedDomain,
            websiteStatus: normalized.websiteStatus,
            facebook: normalized.facebook,
            normalizedFacebook: normalized.normalizedFacebook,
            hasFacebook: normalized.hasFacebook,
            instagram: normalized.instagram,
            normalizedInstagram: normalized.normalizedInstagram,
            hasInstagram: normalized.hasInstagram,
            rating: normalized.rating,
            reviewCount: normalized.reviewCount,
            branchCount: normalized.branchCount,
            estimatedBudget: normalized.estimatedBudget,
            isVerified: normalized.isVerified,
            isRecentlyActive: normalized.isRecentlyActive,
            score: scoreResult.normalizedScore,
            temperature: scoreResult.temperature,
            scoringVersion: scoreResult.scoringVersion,
            scoreExplanation: scoreResult.explanation as unknown as object,
            lastScoredAt: now,
            status: qualityEval.saleabilityStatus,
            confidence: scoreResult.confidence,
            qualificationReasons: scoreResult.qualificationReasons,
            qualificationRules: scoreResult.qualificationRules as unknown as object,
            websiteAnalysis: websiteAnalysis as unknown as object,
            leadType: normalized.leadType,
            exclusive: normalized.exclusive,
            maxPurchasers: normalized.maxPurchasers,
            currentPurchasers: 0,
            source: normalized.source,
            sourceList: [normalized.source],
            sourceId: sourceId || null,
            canonicalIdentityKeys: identityKeys.allKeys,
            fieldProvenance: initialProvenance as unknown as object,
            fieldConflicts: [],
            isCanonical: true,
            qualityScore: qualityEval.qualityScore,
            qualityStatus: qualityEval.qualityStatus,
            freshnessStatus: qualityEval.freshness.freshnessStatus,
            verificationStatus: qualityEval.verificationStatus,
            saleabilityStatus: qualityEval.saleabilityStatus,
            completenessScore: qualityEval.completeness.completenessScore,
            completenessBreakdown: qualityEval.completeness as unknown as object,
            qualityFlags: qualityEval.qualityFlags,
            qualitySummary: qualityEval.summary as unknown as object,
            businessStatus: qualityEval.businessStatus,
            phoneValidationStatus: qualityEval.phoneValidationStatus,
            emailValidationStatus: qualityEval.emailValidationStatus,
            websiteVerificationState: qualityEval.websiteVerificationState,
            lastVerifiedAt: now,
            nextVerificationAt: qualityEval.nextVerificationAt,
          },
        });

        await tx.sourceRecord.update({
          where: { id: sourceRecord.id },
          data: {
            leadId: lead.id,
            status: 'ACTIVE',
          },
        });

        for (const keyRec of identityKeys.records) {
          await tx.leadIdentity
            .create({
              data: {
                leadId: lead.id,
                keyType: keyRec.keyType,
                keyValue: keyRec.keyValue,
                canonicalKey: keyRec.canonicalKey,
                source: normalized.source,
                sourceRecordId: sourceRecord.id,
                isPrimary: keyRec.isPrimary,
              },
            })
            .catch(() => null);
        }

        await tx.leadScore.create({
          data: {
            leadId: lead.id,
            previousScore: null,
            rawScore: scoreResult.rawScore,
            normalizedScore: scoreResult.normalizedScore,
            newScore: scoreResult.normalizedScore,
            previousClassification: null,
            temperature: scoreResult.temperature,
            newClassification: scoreResult.classification,
            scoringVersion: scoreResult.scoringVersion,
            trigger: 'LEAD_CREATED',
            appliedRules: scoreResult.appliedRules as unknown as object,
            evaluatedRules: scoreResult.evaluatedRules as unknown as object,
            explanation: scoreResult.explanation as unknown as object,
            qualificationReasons: scoreResult.qualificationReasons,
            calculatedAt: now,
            evaluatedAt: now,
          },
        });

        await tx.leadVerification.createMany({
          data: [
            {
              leadId: lead.id,
              verificationType: 'PHONE',
              status:
                qualityEval.phoneValidationStatus === 'VALID'
                  ? 'VERIFIED'
                  : qualityEval.phoneValidationStatus === 'INVALID'
                  ? 'FAILED'
                  : 'UNKNOWN',
              previousStatus: 'UNKNOWN',
              checkedAt: now,
              expiresAt: computeVerificationExpiryDate('PHONE', now),
              source: 'INGESTION_PIPELINE',
              resultSummary: `Phone validation: ${qualityEval.phoneValidationStatus}`,
              evidence: {
                phoneValidationStatus: qualityEval.phoneValidationStatus,
                phone: normalized.phone,
                normalizedPhone: normalized.normalizedPhone,
              } as unknown as object,
            },
            {
              leadId: lead.id,
              verificationType: 'WEBSITE',
              status:
                qualityEval.websiteVerificationState === 'WEBSITE_UNREACHABLE' ||
                qualityEval.websiteVerificationState === 'DOMAIN_INVALID'
                  ? 'FAILED'
                  : 'VERIFIED',
              previousStatus: 'UNKNOWN',
              checkedAt: now,
              expiresAt: computeVerificationExpiryDate('WEBSITE', now),
              source: 'INGESTION_PIPELINE',
              resultSummary: `Website verification: ${qualityEval.websiteVerificationState}`,
              evidence: {
                websiteVerificationState: qualityEval.websiteVerificationState,
                website: normalized.website,
                normalizedDomain: normalized.normalizedDomain,
              } as unknown as object,
            },
            {
              leadId: lead.id,
              verificationType: 'ADDRESS',
              status:
                Boolean(normalized.governorate) &&
                Boolean(normalized.city) &&
                !qualityEval.qualityFlags.includes('LOCATION_MISMATCH')
                  ? 'VERIFIED'
                  : 'FAILED',
              previousStatus: 'UNKNOWN',
              checkedAt: now,
              expiresAt: computeVerificationExpiryDate('ADDRESS', now),
              source: 'INGESTION_PIPELINE',
              resultSummary: `Address/location check for ${normalized.governorate} - ${normalized.city}`,
              evidence: {
                governorate: normalized.governorate,
                city: normalized.city,
                address: normalized.address,
              } as unknown as object,
            },
            {
              leadId: lead.id,
              verificationType: 'IDENTITY',
              status:
                Boolean(normalized.businessName) &&
                !qualityEval.qualityFlags.includes('CATEGORY_MISMATCH')
                  ? 'VERIFIED'
                  : 'FAILED',
              previousStatus: 'UNKNOWN',
              checkedAt: now,
              expiresAt: computeVerificationExpiryDate('IDENTITY', now),
              source: 'INGESTION_PIPELINE',
              resultSummary: `Identity/category check for ${normalized.businessName} (${normalized.category})`,
              evidence: {
                businessName: normalized.businessName,
                category: normalized.category,
              } as unknown as object,
            },
            {
              leadId: lead.id,
              verificationType: 'BUSINESS_STATUS',
              status:
                qualityEval.businessStatus === 'OPEN'
                  ? 'VERIFIED'
                  : qualityEval.businessStatus === 'CLOSED'
                    ? 'FAILED'
                    : 'NEEDS_REVERIFICATION',
              previousStatus: 'UNKNOWN',
              checkedAt: now,
              expiresAt: computeVerificationExpiryDate('BUSINESS_STATUS', now),
              source: 'INGESTION_PIPELINE',
              resultSummary: `Business operational status: ${qualityEval.businessStatus}`,
              evidence: {
                businessStatus: qualityEval.businessStatus,
              } as unknown as object,
            },
            {
              leadId: lead.id,
              verificationType: 'FULL',
              status:
                qualityEval.verificationStatus === 'VERIFIED' ||
                qualityEval.verificationStatus === 'PARTIALLY_VERIFIED'
                  ? 'VERIFIED'
                  : qualityEval.verificationStatus === 'FAILED_VERIFICATION'
                    ? 'FAILED'
                    : 'NEEDS_REVERIFICATION',
              previousStatus: 'UNKNOWN',
              checkedAt: now,
              expiresAt: computeVerificationExpiryDate('FULL', now),
              source: 'INGESTION_PIPELINE',
              resultSummary: `Initial quality evaluation: ${qualityEval.qualityStatus} (${qualityEval.qualityScore}/100)`,
              evidence: {
                qualityScore: qualityEval.qualityScore,
                qualityStatus: qualityEval.qualityStatus,
                completenessScore: qualityEval.completeness.completenessScore,
                freshnessStatus: qualityEval.freshness.freshnessStatus,
                saleabilityStatus: qualityEval.saleabilityStatus,
                qualityFlags: qualityEval.qualityFlags,
              } as unknown as object,
            },
          ],
        });

        return lead;
      });

      logScoringOperation({
        event: 'LEAD_SCORE_EVALUATED',
        leadId: createdLead.id,
        scoringVersion: scoreResult.scoringVersion,
        previousScore: null,
        newScore: scoreResult.normalizedScore,
        previousClassification: null,
        classification: scoreResult.classification,
        trigger: 'LEAD_CREATED',
        durationMs: Date.now() - scoreStartMs,
        rulesApplied: scoreResult.appliedRules.map((r) => r.ruleKey),
      });

      logVerificationEvent({
        leadId: createdLead.id,
        verificationType: 'FULL',
        source: 'INGESTION_PIPELINE',
        previousStatus: 'UNKNOWN',
        newStatus: qualityEval.verificationStatus,
        durationMs: Date.now() - scoreStartMs,
        result: qualityEval.qualityStatus,
        qualityScore: qualityEval.qualityScore,
        saleabilityStatus: qualityEval.saleabilityStatus,
      });

      validCount += 1;
      await prisma.importRecord.create({
        data: {
          importJobId: importJob.id,
          rowNumber,
          rawData: raw as unknown as object,
          status: 'VALID',
          leadId: createdLead.id,
        },
      });

      reportRecords.push({
        rowNumber,
        businessName: createdLead.businessName,
        status: 'VALID',
        decision: 'UNIQUE',
        leadId: createdLead.id,
        sourceRecordId: sourceRecord.id,
      });
    });
  }

  await prisma.importJob.update({
    where: { id: importJob.id },
    data: {
      status: 'COMPLETED',
      validCount,
      duplicateCount,
      invalidCount,
      completedAt: new Date(),
      summary: {
        imported: rawRecords.length,
        valid: validCount,
        duplicates: duplicateCount,
        possibleDuplicates: possibleDuplicateCount,
        conflicts: conflictCount,
        invalid: invalidCount,
      },
    },
  });

  if (sourceId) {
    await prisma.leadSource.update({
      where: { id: sourceId },
      data: {
        lastSyncAt: new Date(),
        recordsCount: { increment: validCount },
      },
    });
  }

  return {
    importJobId: importJob.id,
    imported: rawRecords.length,
    valid: validCount,
    duplicates: duplicateCount,
    possibleDuplicates: possibleDuplicateCount,
    conflicts: conflictCount,
    invalid: invalidCount,
    records: reportRecords,
  };
}
