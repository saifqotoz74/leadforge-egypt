import {
  AppliedScoringRule,
  EvaluatedRuleRecord,
  LeadTemperatureBand,
  ScoreExplanationData,
  ScoreReasonItem,
} from './types';

/**
 * ScoreExplanation:
 * Builds a structured, human-readable explanation for every calculated lead score,
 * including both the applied rules (`reasons`) and the full diagnostic audit trail (`evaluatedRules`).
 */
export class ScoreExplanation {
  static build(params: {
    rawScore: number;
    normalizedScore: number;
    classification: LeadTemperatureBand;
    scoringVersion: string;
    appliedRules: AppliedScoringRule[];
    evaluatedRules: EvaluatedRuleRecord[];
  }): {
    explanation: ScoreExplanationData;
    qualificationReasons: string[];
  } {
    const {
      rawScore,
      normalizedScore,
      classification,
      scoringVersion,
      appliedRules,
      evaluatedRules,
    } = params;

    const reasons: ScoreReasonItem[] = appliedRules.map((rule) => ({
      ruleId: rule.ruleId,
      ruleKey: rule.ruleKey,
      code: rule.code,
      label: rule.label || rule.nameEn,
      labelAr: rule.name,
      points: rule.points,
      category: rule.category,
      ruleGroup: rule.ruleGroup,
    }));

    const qualificationReasons: string[] = appliedRules.map((rule) => {
      const sign = rule.weight >= 0 ? `+${rule.weight}` : `${rule.weight}`;
      return `${sign} ${rule.name} (${rule.nameEn})`;
    });

    const reasonsSummary =
      reasons.length > 0
        ? reasons.map((r) => `${r.points >= 0 ? `+${r.points}` : r.points} ${r.label}`).join(', ')
        : 'No positive scoring rules matched';

    const summary = `Score: ${normalizedScore}/100 (${classification}) [${scoringVersion}] — ${reasonsSummary}`;

    return {
      explanation: {
        score: normalizedScore,
        rawScore,
        classification,
        scoringVersion,
        reasons,
        evaluatedRules,
        summary,
      },
      qualificationReasons,
    };
  }
}
