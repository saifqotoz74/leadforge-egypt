import { Prisma, PrismaClient, VerificationType } from '@prisma/client';
import {
  FeedbackConfidenceLevel,
  FeedbackSourceType,
  QualityReverificationSignal,
} from './types';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Deterministic source confidence weighting (Section 21):
 * - SINGLE_DEVELOPER_REPORT -> MEDIUM
 * - MULTIPLE_DEVELOPER_REPORTS -> HIGH
 * - OFFICIAL_VERIFICATION -> HIGH
 * - UNVERIFIED_USER_NOTE -> LOW
 */
export function resolveFeedbackSourceConfidence(params: {
  sourceType?: FeedbackSourceType;
  corroboratingDevelopersCount?: number;
  hasStructuredReason?: boolean;
}): {
  sourceType: FeedbackSourceType;
  confidence: FeedbackConfidenceLevel;
} {
  const {
    sourceType,
    corroboratingDevelopersCount = 1,
    hasStructuredReason = true,
  } = params;

  if (sourceType === 'OFFICIAL_VERIFICATION') {
    return { sourceType: 'OFFICIAL_VERIFICATION', confidence: 'HIGH' };
  }
  if (
    sourceType === 'MULTIPLE_DEVELOPER_REPORTS' ||
    corroboratingDevelopersCount >= 2
  ) {
    return { sourceType: 'MULTIPLE_DEVELOPER_REPORTS', confidence: 'HIGH' };
  }
  if (sourceType === 'UNVERIFIED_USER_NOTE' || !hasStructuredReason) {
    return { sourceType: 'UNVERIFIED_USER_NOTE', confidence: 'LOW' };
  }
  return { sourceType: 'SINGLE_DEVELOPER_REPORT', confidence: 'MEDIUM' };
}

export function mapReasonCodeToReverificationSignal(
  reasonCode: string | null | undefined
): {
  signal: QualityReverificationSignal;
  verificationType: VerificationType;
} | null {
  if (!reasonCode) return null;
  const normalized = reasonCode.trim().toUpperCase();

  switch (normalized) {
    case 'PHONE_INVALID':
    case 'PHONE_UNREACHABLE':
    case 'INVALID_NUMBER':
    case 'WRONG_PHONE':
    case 'WRONG_CONTACT':
      return {
        signal: 'PHONE_REQUIRES_REVERIFICATION',
        verificationType: 'PHONE',
      };
    case 'BUSINESS_CLOSED':
    case 'BUSINESS_NOT_FOUND':
    case 'FAKE_BUSINESS':
    case 'WRONG_BUSINESS':
      return {
        signal: 'BUSINESS_STATUS_REQUIRES_VERIFICATION',
        verificationType: 'BUSINESS_STATUS',
      };
    case 'EMAIL_INVALID':
    case 'EMAIL_BOUNCED':
    case 'BOUNCED':
    case 'WRONG_EMAIL':
      return {
        signal: 'EMAIL_REQUIRES_REVERIFICATION',
        verificationType: 'EMAIL',
      };
    case 'ALREADY_HAS_GOOD_WEBSITE':
    case 'ALREADY_HAS_WEBSITE':
      return {
        signal: 'WEBSITE_REQUIRES_REVERIFICATION',
        verificationType: 'WEBSITE',
      };
    case 'WRONG_CATEGORY':
    case 'BUSINESS_WRONG_CATEGORY':
      return {
        signal: 'CATEGORY_REQUIRES_REVERIFICATION',
        verificationType: 'IDENTITY',
      };
    case 'WRONG_LOCATION':
    case 'BUSINESS_WRONG_LOCATION':
    case 'BUSINESS_MOVED':
      return {
        signal: 'LOCATION_REQUIRES_REVERIFICATION',
        verificationType: 'ADDRESS',
      };
    case 'DUPLICATE':
    case 'DUPLICATE_LEAD':
    case 'BUSINESS_DUPLICATE':
    case 'INVALID_LEAD':
      return {
        signal: 'IDENTITY_REQUIRES_REVERIFICATION',
        verificationType: 'IDENTITY',
      };
    default:
      return null;
  }
}

export interface QualitySignalResult {
  signalTriggered: boolean;
  signal: QualityReverificationSignal | null;
  verificationType: VerificationType | null;
  verificationId: string | null;
  confidence: FeedbackConfidenceLevel;
  sourceType: FeedbackSourceType;
  corroboratingDevelopersCount: number;
  qualityFlagsAdded: string[];
  trustedSourceDataPreserved: boolean;
}

/**
 * Emits a non-destructive reverification signal to the Phase 3 Quality Engine.
 * Never overwrites trusted source data (`phone`, `email`, `businessStatus`, `phoneValidationStatus`).
 */
export async function emitQualityReverificationSignal(
  db: DbClient,
  params: {
    leadId: string;
    developerId: string;
    reasonCode: string | null | undefined;
    note?: string | null;
    explicitSourceType?: FeedbackSourceType;
  }
): Promise<QualitySignalResult> {
  const { leadId, developerId, reasonCode, note, explicitSourceType } = params;
  const mapping = mapReasonCodeToReverificationSignal(reasonCode);

  if (!mapping) {
    const resolved = resolveFeedbackSourceConfidence({
      sourceType: explicitSourceType,
      corroboratingDevelopersCount: 1,
      hasStructuredReason: Boolean(reasonCode),
    });
    return {
      signalTriggered: false,
      signal: null,
      verificationType: null,
      verificationId: null,
      confidence: resolved.confidence,
      sourceType: resolved.sourceType,
      corroboratingDevelopersCount: 1,
      qualityFlagsAdded: [],
      trustedSourceDataPreserved: true,
    };
  }

  // Count distinct developers who have reported this reasonCode or signal on this lead
  const existingReports = await db.leadFeedback.findMany({
    where: {
      leadId,
      reasonCode: reasonCode?.trim().toUpperCase(),
    },
    select: { userId: true },
  });
  const distinctDevs = new Set<string>(existingReports.map((r) => r.userId));
  distinctDevs.add(developerId);
  const corroboratingDevelopersCount = distinctDevs.size;

  const { sourceType, confidence } = resolveFeedbackSourceConfidence({
    sourceType: explicitSourceType,
    corroboratingDevelopersCount,
    hasStructuredReason: true,
  });

  // If corroborated by multiple developers, upgrade earlier feedback rows for this lead & reasonCode to HIGH confidence
  if (corroboratingDevelopersCount >= 2 && reasonCode) {
    await db.leadFeedback.updateMany({
      where: {
        leadId,
        reasonCode: reasonCode.trim().toUpperCase(),
      },
      data: {
        confidence: 'HIGH',
      },
    });
  }

  const verification = await db.leadVerification.create({
    data: {
      leadId,
      verificationType: mapping.verificationType,
      status: 'NEEDS_REVERIFICATION',
      checkedAt: new Date(),
      source: `DEVELOPER_FEEDBACK_SIGNAL:${sourceType}`,
      resultSummary: `${mapping.signal}: Developer reported ${reasonCode}${
        note ? ` (${note.slice(0, 140)})` : ''
      }`,
      evidence: {
        signal: mapping.signal,
        reasonCode,
        note: note ?? null,
        developerId,
        sourceType,
        confidence,
        confidenceScore: confidence === 'HIGH' ? 85 : confidence === 'MEDIUM' ? 60 : 35,
        corroboratingDevelopersCount,
        nonDestructive: true,
      } as Prisma.InputJsonValue,
    },
  });

  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      qualityFlags: true,
    },
  });

  const currentFlags = Array.isArray(lead?.qualityFlags) ? lead.qualityFlags : [];
  const flagsToAdd: string[] = [mapping.signal];
  if (corroboratingDevelopersCount >= 2) {
    flagsToAdd.push('MULTIPLE_DEVELOPER_REPORTS_CORROBORATED');
  }
  const mergedFlags = Array.from(new Set([...currentFlags, ...flagsToAdd]));

  // Non-destructively append quality signal flags without overwriting phone, email, businessStatus, or phoneValidationStatus
  await db.lead.update({
    where: { id: leadId },
    data: {
      qualityFlags: mergedFlags,
    },
  });

  return {
    signalTriggered: true,
    signal: mapping.signal,
    verificationType: mapping.verificationType,
    verificationId: verification.id,
    confidence,
    sourceType,
    corroboratingDevelopersCount,
    qualityFlagsAdded: flagsToAdd,
    trustedSourceDataPreserved: true,
  };
}
