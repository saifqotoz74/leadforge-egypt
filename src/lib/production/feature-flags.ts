/**
 * PHASE 10 — SERVER-SIDE PRODUCTION FEATURE FLAGS & SAFE RELEASE GATE
 *
 * Provides deterministic, server-side-only feature flags with safe defaults
 * and an auditable administrative override history.
 * Never used as a client-side authorization mechanism.
 */

export type FeatureFlagKey =
  | 'collector_scheduled_runs'
  | 'live_payment_processing'
  | 'payment_webhooks_enabled'
  | 'scoring_v2_experimental'
  | 'matching_v2_experimental'
  | 'analytics_flywheel_recommendations'
  | 'transactional_email_dispatch'
  | 'public_registration_enabled';

export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  description: string;
  defaultEnabled: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  owner: string;
}

export interface FeatureFlagAuditEntry {
  key: FeatureFlagKey;
  previousValue: boolean;
  newValue: boolean;
  actorId: string;
  reason: string;
  changedAt: string;
}

export const FEATURE_FLAG_DEFINITIONS: Record<FeatureFlagKey, FeatureFlagDefinition> = {
  collector_scheduled_runs: {
    key: 'collector_scheduled_runs',
    description: 'Controls whether automated external collector jobs execute on schedule.',
    defaultEnabled: false,
    riskLevel: 'HIGH',
    owner: 'Data Ingestion Engineering',
  },
  live_payment_processing: {
    key: 'live_payment_processing',
    description: 'Controls whether live payment checkout sessions are enabled for subscriptions.',
    defaultEnabled: false,
    riskLevel: 'HIGH',
    owner: 'Billing & Payments Engineering',
  },
  payment_webhooks_enabled: {
    key: 'payment_webhooks_enabled',
    description: 'Controls whether incoming payment provider webhooks are processed.',
    defaultEnabled: true,
    riskLevel: 'HIGH',
    owner: 'Billing & Payments Engineering',
  },
  scoring_v2_experimental: {
    key: 'scoring_v2_experimental',
    description: 'Gates experimental scoring rules before promotion to active rule version.',
    defaultEnabled: false,
    riskLevel: 'MEDIUM',
    owner: 'Scoring & Quality Engineering',
  },
  matching_v2_experimental: {
    key: 'matching_v2_experimental',
    description: 'Gates experimental matching weight adjustments prior to approval.',
    defaultEnabled: false,
    riskLevel: 'MEDIUM',
    owner: 'Matching Engine Team',
  },
  analytics_flywheel_recommendations: {
    key: 'analytics_flywheel_recommendations',
    description: 'Enables deterministic rule review recommendations in the admin analytics dashboard.',
    defaultEnabled: true,
    riskLevel: 'LOW',
    owner: 'Analytics Engineering',
  },
  transactional_email_dispatch: {
    key: 'transactional_email_dispatch',
    description: 'Controls outbound email dispatch via configured SMTP/API provider.',
    defaultEnabled: false,
    riskLevel: 'MEDIUM',
    owner: 'Platform Operations',
  },
  public_registration_enabled: {
    key: 'public_registration_enabled',
    description: 'Allows self-service developer account registration.',
    defaultEnabled: true,
    riskLevel: 'MEDIUM',
    owner: 'Security & Identity Team',
  },
};

const runtimeFlagOverrides = new Map<FeatureFlagKey, boolean>();
const flagAuditHistory: FeatureFlagAuditEntry[] = [];

export function isFeatureFlagEnabled(
  key: FeatureFlagKey,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (runtimeFlagOverrides.has(key)) {
    return runtimeFlagOverrides.get(key)!;
  }
  const envKey = `FF_${key.toUpperCase()}`;
  const rawEnv = env[envKey];
  if (rawEnv !== undefined) {
    return rawEnv.trim().toLowerCase() === 'true' || rawEnv.trim() === '1';
  }
  return FEATURE_FLAG_DEFINITIONS[key]?.defaultEnabled ?? false;
}

export function setFeatureFlagOverride(params: {
  key: FeatureFlagKey;
  enabled: boolean;
  actorId: string;
  reason: string;
}): FeatureFlagAuditEntry {
  if (!FEATURE_FLAG_DEFINITIONS[params.key]) {
    throw new Error(`Unknown feature flag: ${params.key}`);
  }
  if (!params.actorId || !params.actorId.trim()) {
    throw new Error('actorId is required to modify a production feature flag.');
  }
  if (!params.reason || params.reason.trim().length < 5) {
    throw new Error('A descriptive reason (min 5 chars) is required to modify a production feature flag.');
  }

  const previousValue = isFeatureFlagEnabled(params.key);
  runtimeFlagOverrides.set(params.key, params.enabled);

  const entry: FeatureFlagAuditEntry = {
    key: params.key,
    previousValue,
    newValue: params.enabled,
    actorId: params.actorId.trim(),
    reason: params.reason.trim(),
    changedAt: new Date().toISOString(),
  };
  flagAuditHistory.push(entry);
  return entry;
}

export function getFeatureFlagsSnapshot(env: Record<string, string | undefined> = process.env) {
  const flags = (Object.keys(FEATURE_FLAG_DEFINITIONS) as FeatureFlagKey[]).map((key) => {
    const def = FEATURE_FLAG_DEFINITIONS[key];
    return {
      ...def,
      enabled: isFeatureFlagEnabled(key, env),
      hasRuntimeOverride: runtimeFlagOverrides.has(key),
    };
  });

  return {
    flags,
    auditHistory: [...flagAuditHistory],
  };
}

export function getFeatureFlagAuditHistory(): FeatureFlagAuditEntry[] {
  return [...flagAuditHistory];
}

export function resetFeatureFlagsForTesting(): void {
  runtimeFlagOverrides.clear();
  flagAuditHistory.length = 0;
}
