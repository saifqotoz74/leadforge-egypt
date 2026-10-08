import { ClassificationThresholds, LeadTemperatureBand } from './types';

/**
 * Preserved compatible classification thresholds used across the existing LeadForge Egypt platform:
 * 0–49   = COLD
 * 50–69  = WARM
 * 70–84  = HOT
 * 85–100 = PREMIUM
 */
export const DEFAULT_CLASSIFICATION_THRESHOLDS: ClassificationThresholds = {
  coldMax: 49,
  warmMin: 50,
  warmMax: 69,
  hotMin: 70,
  hotMax: 84,
  premiumMin: 85,
};

/**
 * Alternative quartile classification thresholds (0–24 COLD, 25–49 WARM, 50–74 HOT, 75–100 PREMIUM).
 */
export const QUARTILE_CLASSIFICATION_THRESHOLDS: ClassificationThresholds = {
  coldMax: 24,
  warmMin: 25,
  warmMax: 49,
  hotMin: 50,
  hotMax: 74,
  premiumMin: 75,
};

export function resolveClassificationThresholds(
  custom?: Partial<ClassificationThresholds> | null
): ClassificationThresholds {
  if (!custom) return DEFAULT_CLASSIFICATION_THRESHOLDS;
  const warmMin = custom.warmMin ?? DEFAULT_CLASSIFICATION_THRESHOLDS.warmMin;
  const hotMin = custom.hotMin ?? DEFAULT_CLASSIFICATION_THRESHOLDS.hotMin;
  const premiumMin = custom.premiumMin ?? DEFAULT_CLASSIFICATION_THRESHOLDS.premiumMin;

  return {
    coldMax: custom.coldMax ?? Math.max(0, warmMin - 1),
    warmMin,
    warmMax: custom.warmMax ?? Math.max(warmMin, hotMin - 1),
    hotMin,
    hotMax: custom.hotMax ?? Math.max(hotMin, premiumMin - 1),
    premiumMin,
  };
}

/**
 * LeadClassification:
 * Deterministic classification of normalized score (0..100) into COLD | WARM | HOT | PREMIUM
 * using configurable thresholds.
 */
export class LeadClassification {
  static classify(
    normalizedScore: number,
    customThresholds?: Partial<ClassificationThresholds> | null
  ): LeadTemperatureBand {
    const thresholds = resolveClassificationThresholds(customThresholds);
    const score = Math.max(0, Math.min(100, Math.round(Number(normalizedScore) || 0)));

    if (score >= thresholds.premiumMin) return 'PREMIUM';
    if (score >= thresholds.hotMin) return 'HOT';
    if (score >= thresholds.warmMin) return 'WARM';
    return 'COLD';
  }
}

export function classifyTemperature(
  normalizedScore: number,
  customThresholds?: Partial<ClassificationThresholds> | null
): LeadTemperatureBand {
  return LeadClassification.classify(normalizedScore, customThresholds);
}
