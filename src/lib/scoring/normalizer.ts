import { NormalizationBounds } from './types';

export const DEFAULT_NORMALIZATION_BOUNDS: NormalizationBounds = {
  minScore: 0,
  maxScore: 100,
};

/**
 * ScoreNormalizer:
 * Predictable, deterministic score normalization strategy clamping rawScore to [0, 100].
 * Never allows negative values or values above 100.
 */
export class ScoreNormalizer {
  static normalize(
    rawScore: number,
    bounds: Partial<NormalizationBounds> = DEFAULT_NORMALIZATION_BOUNDS
  ): number {
    if (typeof rawScore !== 'number' || Number.isNaN(rawScore) || !Number.isFinite(rawScore)) {
      return 0;
    }
    const min = Math.max(0, bounds.minScore ?? DEFAULT_NORMALIZATION_BOUNDS.minScore);
    const max = Math.min(100, bounds.maxScore ?? DEFAULT_NORMALIZATION_BOUNDS.maxScore);
    const rounded = Math.round(rawScore);
    return Math.max(min, Math.min(max, rounded));
  }
}

export function normalizeLeadScore(
  rawScore: number,
  bounds?: Partial<NormalizationBounds>
): number {
  return ScoreNormalizer.normalize(rawScore, bounds);
}
