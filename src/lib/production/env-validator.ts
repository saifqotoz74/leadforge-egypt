/**
 * PHASE 10 — ENVIRONMENT SEPARATION & PRODUCTION CONFIGURATION VALIDATOR
 *
 * Enforces strict separation between development, test, staging, and production
 * environments. Validates all mandatory production settings before startup or
 * deployment without ever logging or returning secret values.
 */

export type EnvironmentTier = 'development' | 'test' | 'staging' | 'production';

export type EnvCategory =
  | 'Application'
  | 'Database'
  | 'Authentication'
  | 'Payment'
  | 'Email'
  | 'Storage'
  | 'Collectors'
  | 'Observability';

export interface EnvVariableDescriptor {
  key: string;
  category: EnvCategory;
  requiredInProduction: boolean;
  isSecret: boolean;
  description: string;
}

export const ENVIRONMENT_VARIABLE_CATALOG: readonly EnvVariableDescriptor[] = [
  // Application
  { key: 'NODE_ENV', category: 'Application', requiredInProduction: true, isSecret: false, description: 'Runtime environment mode (development, test, production)' },
  { key: 'APP_ENV', category: 'Application', requiredInProduction: false, isSecret: false, description: 'Explicit deployment tier (development, test, staging, production)' },
  { key: 'APP_URL', category: 'Application', requiredInProduction: true, isSecret: false, description: 'Canonical public HTTPS URL of the application' },
  { key: 'API_URL', category: 'Application', requiredInProduction: false, isSecret: false, description: 'Canonical API base URL if separated from APP_URL' },
  { key: 'ALLOWED_ORIGINS', category: 'Application', requiredInProduction: false, isSecret: false, description: 'Comma-separated list of allowed CORS HTTPS origins' },
  { key: 'DEBUG', category: 'Application', requiredInProduction: false, isSecret: false, description: 'Debug flag (must be disabled in production)' },
  { key: 'ALLOW_PRODUCTION_SEED', category: 'Application', requiredInProduction: false, isSecret: false, description: 'Seed safety gate (must never be true in production)' },

  // Database
  { key: 'DATABASE_URL', category: 'Database', requiredInProduction: true, isSecret: true, description: 'PostgreSQL connection string' },
  { key: 'USE_EXTERNAL_PG', category: 'Database', requiredInProduction: true, isSecret: false, description: 'Must be "true" in production/staging to use managed PostgreSQL instead of PGlite' },
  { key: 'DB_POOL_MAX', category: 'Database', requiredInProduction: false, isSecret: false, description: 'Maximum database pool connections' },
  { key: 'DB_CONNECT_TIMEOUT_MS', category: 'Database', requiredInProduction: false, isSecret: false, description: 'Database connection timeout in milliseconds' },

  // Authentication
  { key: 'AUTH_SECRET', category: 'Authentication', requiredInProduction: true, isSecret: true, description: 'HMAC-SHA256 signing secret for sessions (minimum 32 chars in production)' },
  { key: 'SESSION_TTL_SECONDS', category: 'Authentication', requiredInProduction: false, isSecret: false, description: 'Session lifetime in seconds' },

  // Payment
  { key: 'PAYMENT_ENABLED', category: 'Payment', requiredInProduction: false, isSecret: false, description: 'Whether online payment processing is active (true/false)' },
  { key: 'PAYMENT_MODE', category: 'Payment', requiredInProduction: false, isSecret: false, description: 'Payment mode (SANDBOX, TEST, LIVE)' },
  { key: 'PAYMENT_PROVIDER_NAME', category: 'Payment', requiredInProduction: false, isSecret: false, description: 'Configured payment gateway identifier' },
  { key: 'PAYMENT_PUBLIC_KEY', category: 'Payment', requiredInProduction: false, isSecret: false, description: 'Public payment gateway key' },
  { key: 'PAYMENT_SECRET_KEY', category: 'Payment', requiredInProduction: false, isSecret: true, description: 'Secret payment gateway key' },
  { key: 'PAYMENT_WEBHOOK_SECRET', category: 'Payment', requiredInProduction: false, isSecret: true, description: 'HMAC signing secret for verifying payment webhooks' },

  // Email
  { key: 'EMAIL_PROVIDER', category: 'Email', requiredInProduction: true, isSecret: false, description: 'Email provider mode (SMTP, API, DISABLED, CONSOLE)' },
  { key: 'EMAIL_FROM', category: 'Email', requiredInProduction: true, isSecret: false, description: 'Verified sender email address' },
  { key: 'EMAIL_API_KEY', category: 'Email', requiredInProduction: false, isSecret: true, description: 'Transactional email provider API key' },
  { key: 'SMTP_HOST', category: 'Email', requiredInProduction: false, isSecret: false, description: 'SMTP server hostname' },
  { key: 'SMTP_PORT', category: 'Email', requiredInProduction: false, isSecret: false, description: 'SMTP server port' },

  // Storage
  { key: 'STORAGE_PROVIDER', category: 'Storage', requiredInProduction: false, isSecret: false, description: 'Object storage provider (LOCAL, S3, R2, DISABLED)' },
  { key: 'STORAGE_BUCKET', category: 'Storage', requiredInProduction: false, isSecret: false, description: 'Object storage bucket name' },
  { key: 'STORAGE_ACCESS_KEY_ID', category: 'Storage', requiredInProduction: false, isSecret: true, description: 'Object storage access key ID' },
  { key: 'STORAGE_SECRET_ACCESS_KEY', category: 'Storage', requiredInProduction: false, isSecret: true, description: 'Object storage secret access key' },

  // Collectors
  { key: 'COLLECTORS_ENABLED', category: 'Collectors', requiredInProduction: false, isSecret: false, description: 'Master switch for automated scheduled collectors (true/false)' },
  { key: 'COLLECTOR_ALLOWED_SOURCES', category: 'Collectors', requiredInProduction: false, isSecret: false, description: 'Comma-separated list of verified collector source keys allowed in production' },
  { key: 'COLLECTOR_MAX_RECORDS_PER_RUN', category: 'Collectors', requiredInProduction: false, isSecret: false, description: 'Hard cap on records ingested per collector execution' },

  // Observability
  { key: 'LOG_LEVEL', category: 'Observability', requiredInProduction: false, isSecret: false, description: 'Minimum structured log level (debug, info, warn, error)' },
  { key: 'MONITORING_ENABLED', category: 'Observability', requiredInProduction: false, isSecret: false, description: 'Whether runtime metrics and alerting checks are active' },
  { key: 'ALERT_WEBHOOK_URL', category: 'Observability', requiredInProduction: false, isSecret: true, description: 'Webhook destination for P0/P1 critical operational alerts' },
  { key: 'APP_VERSION', category: 'Observability', requiredInProduction: false, isSecret: false, description: 'Release version or commit SHA' },
] as const;

export interface EnvValidationIssue {
  category: EnvCategory;
  variable: string;
  code:
    | 'MISSING_REQUIRED_VARIABLE'
    | 'WEAK_SECRET'
    | 'INSECURE_URL'
    | 'LOCALHOST_FORBIDDEN_IN_PRODUCTION'
    | 'DEV_DATABASE_FORBIDDEN_IN_PRODUCTION'
    | 'TEST_CREDENTIALS_IN_PRODUCTION'
    | 'FAKE_PROVIDER_IN_PRODUCTION'
    | 'DEBUG_ENABLED_IN_PRODUCTION'
    | 'SEED_ENABLED_IN_PRODUCTION'
    | 'INVALID_FORMAT'
    | 'INCONSISTENT_CONFIGURATION';
  severity: 'CRITICAL' | 'WARNING';
  message: string;
}

export interface EnvironmentValidationReport {
  status: 'VALID' | 'ENVIRONMENT_VALIDATION_FAILED';
  tier: EnvironmentTier;
  nodeEnv: string;
  checkedAt: string;
  summary: {
    totalChecked: number;
    criticalErrors: number;
    warnings: number;
  };
  categories: Record<EnvCategory, { status: 'OK' | 'FAILED' | 'WARNING'; issues: EnvValidationIssue[] }>;
  issues: EnvValidationIssue[];
  redactedSnapshot: Record<string, string>;
}

const KNOWN_WEAK_SECRETS = new Set([
  'leadforge-egypt-secret-key-2025-deterministic-mvp',
  'replace-with-at-least-32-bytes-of-cryptographic-randomness',
  'changeme',
  'secret',
  'development',
  'test-secret',
  'password',
  '12345678901234567890123456789012',
]);

function isLocalhostOrDevHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.test') ||
      host.endsWith('.localhost')
    );
  } catch {
    const lower = urlStr.toLowerCase();
    return lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('0.0.0.0');
  }
}

export function resolveEnvironmentTier(env: Record<string, string | undefined> = process.env): EnvironmentTier {
  const explicitTier = (env.APP_ENV || '').trim().toLowerCase();
  if (explicitTier === 'production' || explicitTier === 'staging' || explicitTier === 'test' || explicitTier === 'development') {
    return explicitTier;
  }
  const nodeEnv = (env.NODE_ENV || 'development').trim().toLowerCase();
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'test') return 'test';
  return 'development';
}

/**
 * Redacts all secret values so configuration diagnostics can never leak credentials.
 */
export function buildRedactedEnvSnapshot(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const descriptor of ENVIRONMENT_VARIABLE_CATALOG) {
    const raw = env[descriptor.key];
    if (raw === undefined || raw === '') {
      snapshot[descriptor.key] = '<UNSET>';
    } else if (descriptor.isSecret) {
      snapshot[descriptor.key] = '<REDACTED>';
    } else {
      snapshot[descriptor.key] = raw;
    }
  }
  return snapshot;
}

/**
 * Validates environment configuration. In production or staging, enforces strict
 * security, database, URL, payment, email, and collector guardrails.
 */
export function validateEnvironmentConfiguration(
  env: Record<string, string | undefined> = process.env,
  options?: { enforceProductionRules?: boolean }
): EnvironmentValidationReport {
  const tier = options?.enforceProductionRules ? 'production' : resolveEnvironmentTier(env);
  const nodeEnv = (env.NODE_ENV || 'development').trim();
  const isProd = tier === 'production';
  const isStaging = tier === 'staging';
  const isStrict = isProd || isStaging;

  const issues: EnvValidationIssue[] = [];
  const categories: Record<EnvCategory, { status: 'OK' | 'FAILED' | 'WARNING'; issues: EnvValidationIssue[] }> = {
    Application: { status: 'OK', issues: [] },
    Database: { status: 'OK', issues: [] },
    Authentication: { status: 'OK', issues: [] },
    Payment: { status: 'OK', issues: [] },
    Email: { status: 'OK', issues: [] },
    Storage: { status: 'OK', issues: [] },
    Collectors: { status: 'OK', issues: [] },
    Observability: { status: 'OK', issues: [] },
  };

  const addIssue = (issue: EnvValidationIssue) => {
    issues.push(issue);
    categories[issue.category].issues.push(issue);
    if (issue.severity === 'CRITICAL') {
      categories[issue.category].status = 'FAILED';
    } else if (categories[issue.category].status === 'OK') {
      categories[issue.category].status = 'WARNING';
    }
  };

  // 1. Application checks
  const appUrl = (env.APP_URL || '').trim();
  if (isStrict && !appUrl) {
    addIssue({
      category: 'Application',
      variable: 'APP_URL',
      code: 'MISSING_REQUIRED_VARIABLE',
      severity: 'CRITICAL',
      message: 'APP_URL is required in production/staging.',
    });
  } else if (appUrl) {
    let validUrl = false;
    try {
      const parsed = new URL(appUrl);
      validUrl = parsed.protocol === 'http:' || parsed.protocol === 'https:';
      if (isStrict && parsed.protocol !== 'https:') {
        addIssue({
          category: 'Application',
          variable: 'APP_URL',
          code: 'INSECURE_URL',
          severity: 'CRITICAL',
          message: 'APP_URL must use https:// in production/staging.',
        });
      }
    } catch {
      validUrl = false;
    }
    if (!validUrl) {
      addIssue({
        category: 'Application',
        variable: 'APP_URL',
        code: 'INVALID_FORMAT',
        severity: 'CRITICAL',
        message: 'APP_URL must be a valid URL.',
      });
    } else if (isProd && isLocalhostOrDevHost(appUrl)) {
      addIssue({
        category: 'Application',
        variable: 'APP_URL',
        code: 'LOCALHOST_FORBIDDEN_IN_PRODUCTION',
        severity: 'CRITICAL',
        message: 'APP_URL cannot reference localhost or development domains in production.',
      });
    }
  }

  const apiUrl = (env.API_URL || '').trim();
  if (apiUrl) {
    try {
      const parsed = new URL(apiUrl);
      if (isStrict && parsed.protocol !== 'https:') {
        addIssue({
          category: 'Application',
          variable: 'API_URL',
          code: 'INSECURE_URL',
          severity: 'CRITICAL',
          message: 'API_URL must use https:// in production/staging.',
        });
      }
      if (isProd && isLocalhostOrDevHost(apiUrl)) {
        addIssue({
          category: 'Application',
          variable: 'API_URL',
          code: 'LOCALHOST_FORBIDDEN_IN_PRODUCTION',
          severity: 'CRITICAL',
          message: 'API_URL cannot reference localhost in production.',
        });
      }
    } catch {
      addIssue({
        category: 'Application',
        variable: 'API_URL',
        code: 'INVALID_FORMAT',
        severity: 'CRITICAL',
        message: 'API_URL is not a valid URL.',
      });
    }
  }

  const allowedOrigins = (env.ALLOWED_ORIGINS || '').trim();
  if (allowedOrigins && isProd) {
    const origins = allowedOrigins.split(',').map((o) => o.trim()).filter(Boolean);
    for (const origin of origins) {
      if (origin === '*' || !origin.startsWith('https://') || isLocalhostOrDevHost(origin)) {
        addIssue({
          category: 'Application',
          variable: 'ALLOWED_ORIGINS',
          code: 'INSECURE_URL',
          severity: 'CRITICAL',
          message: 'ALLOWED_ORIGINS in production must only contain explicit https:// non-localhost origins.',
        });
        break;
      }
    }
  }

  if (isProd && (env.DEBUG === 'true' || env.DEBUG === '1')) {
    addIssue({
      category: 'Application',
      variable: 'DEBUG',
      code: 'DEBUG_ENABLED_IN_PRODUCTION',
      severity: 'CRITICAL',
      message: 'DEBUG mode must be disabled in production.',
    });
  }

  if (isProd && (env.ALLOW_PRODUCTION_SEED === 'true' || env.ALLOW_PRODUCTION_SEED === '1')) {
    addIssue({
      category: 'Application',
      variable: 'ALLOW_PRODUCTION_SEED',
      code: 'SEED_ENABLED_IN_PRODUCTION',
      severity: 'CRITICAL',
      message: 'Demo/destructive seeding (ALLOW_PRODUCTION_SEED) must never be enabled in production.',
    });
  }

  // 2. Database checks
  const dbUrl = (env.DATABASE_URL || '').trim();
  const useExternalPg = (env.USE_EXTERNAL_PG || '').trim().toLowerCase();

  if (isStrict && useExternalPg !== 'true') {
    addIssue({
      category: 'Database',
      variable: 'USE_EXTERNAL_PG',
      code: 'DEV_DATABASE_FORBIDDEN_IN_PRODUCTION',
      severity: 'CRITICAL',
      message: 'USE_EXTERNAL_PG must be "true" in production/staging; embedded PGlite is for local development/testing only.',
    });
  }

  if (isStrict && !dbUrl) {
    addIssue({
      category: 'Database',
      variable: 'DATABASE_URL',
      code: 'MISSING_REQUIRED_VARIABLE',
      severity: 'CRITICAL',
      message: 'DATABASE_URL is required in production/staging.',
    });
  } else if (dbUrl) {
    const isPostgresScheme = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');
    if (!isPostgresScheme) {
      addIssue({
        category: 'Database',
        variable: 'DATABASE_URL',
        code: 'INVALID_FORMAT',
        severity: 'CRITICAL',
        message: 'DATABASE_URL must start with postgresql:// or postgres://.',
      });
    } else if (isProd) {
      if (isLocalhostOrDevHost(dbUrl)) {
        addIssue({
          category: 'Database',
          variable: 'DATABASE_URL',
          code: 'LOCALHOST_FORBIDDEN_IN_PRODUCTION',
          severity: 'CRITICAL',
          message: 'DATABASE_URL in production must not point to localhost or 127.0.0.1.',
        });
      }
      const lowerDb = dbUrl.toLowerCase();
      if (
        lowerDb.includes('/leadforge_dev') ||
        lowerDb.includes('/leadforge_test') ||
        lowerDb.includes('postgres:postgres@')
      ) {
        addIssue({
          category: 'Database',
          variable: 'DATABASE_URL',
          code: 'DEV_DATABASE_FORBIDDEN_IN_PRODUCTION',
          severity: 'CRITICAL',
          message: 'DATABASE_URL appears to reference a development/test database or default credentials.',
        });
      }
    }
  }

  // 3. Authentication checks
  const authSecret = (env.AUTH_SECRET || '').trim();
  if (isStrict && !authSecret) {
    addIssue({
      category: 'Authentication',
      variable: 'AUTH_SECRET',
      code: 'MISSING_REQUIRED_VARIABLE',
      severity: 'CRITICAL',
      message: 'AUTH_SECRET is required in production/staging.',
    });
  } else if (authSecret) {
    if (isStrict && (authSecret.length < 32 || KNOWN_WEAK_SECRETS.has(authSecret.toLowerCase()) || KNOWN_WEAK_SECRETS.has(authSecret))) {
      addIssue({
        category: 'Authentication',
        variable: 'AUTH_SECRET',
        code: 'WEAK_SECRET',
        severity: 'CRITICAL',
        message: 'AUTH_SECRET must be at least 32 characters and must not use a known default/placeholder value.',
      });
    }
    const uniqueChars = new Set(authSecret.split('')).size;
    if (isStrict && uniqueChars < 8) {
      addIssue({
        category: 'Authentication',
        variable: 'AUTH_SECRET',
        code: 'WEAK_SECRET',
        severity: 'CRITICAL',
        message: 'AUTH_SECRET lacks sufficient character entropy for production use.',
      });
    }
  }

  // 4. Payment & Webhook checks
  const paymentEnabled = (env.PAYMENT_ENABLED || 'false').trim().toLowerCase() === 'true';
  const paymentMode = (env.PAYMENT_MODE || (isProd ? 'LIVE' : 'SANDBOX')).trim().toUpperCase();
  const paymentSecretKey = (env.PAYMENT_SECRET_KEY || '').trim();
  const paymentPublicKey = (env.PAYMENT_PUBLIC_KEY || '').trim();
  const webhookSecret = (env.PAYMENT_WEBHOOK_SECRET || '').trim();

  if (isProd && paymentEnabled) {
    if (paymentMode !== 'LIVE') {
      addIssue({
        category: 'Payment',
        variable: 'PAYMENT_MODE',
        code: 'TEST_CREDENTIALS_IN_PRODUCTION',
        severity: 'CRITICAL',
        message: 'PAYMENT_MODE must be "LIVE" when PAYMENT_ENABLED is true in production.',
      });
    }
    if (!paymentSecretKey) {
      addIssue({
        category: 'Payment',
        variable: 'PAYMENT_SECRET_KEY',
        code: 'MISSING_REQUIRED_VARIABLE',
        severity: 'CRITICAL',
        message: 'PAYMENT_SECRET_KEY is required when PAYMENT_ENABLED is true in production.',
      });
    } else if (
      paymentSecretKey.toLowerCase().startsWith('sk_test_') ||
      paymentSecretKey.toLowerCase().startsWith('test_') ||
      paymentSecretKey.toLowerCase().includes('sandbox')
    ) {
      addIssue({
        category: 'Payment',
        variable: 'PAYMENT_SECRET_KEY',
        code: 'TEST_CREDENTIALS_IN_PRODUCTION',
        severity: 'CRITICAL',
        message: 'Test/sandbox PAYMENT_SECRET_KEY cannot be used in production.',
      });
    }

    if (!paymentPublicKey) {
      addIssue({
        category: 'Payment',
        variable: 'PAYMENT_PUBLIC_KEY',
        code: 'MISSING_REQUIRED_VARIABLE',
        severity: 'CRITICAL',
        message: 'PAYMENT_PUBLIC_KEY is required when PAYMENT_ENABLED is true in production.',
      });
    } else if (
      paymentPublicKey.toLowerCase().startsWith('pk_test_') ||
      paymentPublicKey.toLowerCase().startsWith('test_')
    ) {
      addIssue({
        category: 'Payment',
        variable: 'PAYMENT_PUBLIC_KEY',
        code: 'TEST_CREDENTIALS_IN_PRODUCTION',
        severity: 'CRITICAL',
        message: 'Test/sandbox PAYMENT_PUBLIC_KEY cannot be used in production.',
      });
    }

    if (!webhookSecret || webhookSecret.length < 24 || KNOWN_WEAK_SECRETS.has(webhookSecret)) {
      addIssue({
        category: 'Payment',
        variable: 'PAYMENT_WEBHOOK_SECRET',
        code: webhookSecret ? 'WEAK_SECRET' : 'MISSING_REQUIRED_VARIABLE',
        severity: 'CRITICAL',
        message: 'PAYMENT_WEBHOOK_SECRET (>= 24 chars, non-default) is required when PAYMENT_ENABLED is true in production.',
      });
    }
  } else if (!isProd && paymentMode === 'LIVE') {
    addIssue({
      category: 'Payment',
      variable: 'PAYMENT_MODE',
      code: 'INCONSISTENT_CONFIGURATION',
      severity: 'CRITICAL',
      message: 'PAYMENT_MODE="LIVE" must not be enabled in non-production environments.',
    });
  }

  // 5. Email checks
  const emailProvider = (env.EMAIL_PROVIDER || (isProd ? '' : 'CONSOLE')).trim().toUpperCase();
  const emailFrom = (env.EMAIL_FROM || '').trim();
  const emailApiKey = (env.EMAIL_API_KEY || '').trim();
  const smtpHost = (env.SMTP_HOST || '').trim();

  if (isProd) {
    if (!emailProvider) {
      addIssue({
        category: 'Email',
        variable: 'EMAIL_PROVIDER',
        code: 'MISSING_REQUIRED_VARIABLE',
        severity: 'CRITICAL',
        message: 'EMAIL_PROVIDER is required in production (SMTP, API, or explicit DISABLED).',
      });
    } else if (emailProvider === 'CONSOLE' || emailProvider === 'FAKE' || emailProvider === 'MOCK') {
      addIssue({
        category: 'Email',
        variable: 'EMAIL_PROVIDER',
        code: 'FAKE_PROVIDER_IN_PRODUCTION',
        severity: 'CRITICAL',
        message: `EMAIL_PROVIDER="${emailProvider}" is forbidden in production.`,
      });
    } else if (emailProvider === 'API' && !emailApiKey) {
      addIssue({
        category: 'Email',
        variable: 'EMAIL_API_KEY',
        code: 'MISSING_REQUIRED_VARIABLE',
        severity: 'CRITICAL',
        message: 'EMAIL_API_KEY is required when EMAIL_PROVIDER="API" in production.',
      });
    } else if (emailProvider === 'SMTP' && !smtpHost) {
      addIssue({
        category: 'Email',
        variable: 'SMTP_HOST',
        code: 'MISSING_REQUIRED_VARIABLE',
        severity: 'CRITICAL',
        message: 'SMTP_HOST is required when EMAIL_PROVIDER="SMTP" in production.',
      });
    }

    if (emailProvider !== 'DISABLED') {
      if (!emailFrom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFrom)) {
        addIssue({
          category: 'Email',
          variable: 'EMAIL_FROM',
          code: emailFrom ? 'INVALID_FORMAT' : 'MISSING_REQUIRED_VARIABLE',
          severity: 'CRITICAL',
          message: 'EMAIL_FROM must be a valid verified sender email address in production.',
        });
      } else if (
        emailFrom.endsWith('@localhost') ||
        emailFrom.endsWith('@example.com') ||
        emailFrom.endsWith('@test.com')
      ) {
        addIssue({
          category: 'Email',
          variable: 'EMAIL_FROM',
          code: 'FAKE_PROVIDER_IN_PRODUCTION',
          severity: 'CRITICAL',
          message: 'EMAIL_FROM cannot use @localhost, @example.com, or @test.com in production.',
        });
      }
    }
  }

  // 6. Collectors checks
  const collectorsEnabled = (env.COLLECTORS_ENABLED || 'false').trim().toLowerCase() === 'true';
  const allowedSources = (env.COLLECTOR_ALLOWED_SOURCES || '').trim();
  if (isProd && collectorsEnabled && !allowedSources) {
    addIssue({
      category: 'Collectors',
      variable: 'COLLECTOR_ALLOWED_SOURCES',
      code: 'MISSING_REQUIRED_VARIABLE',
      severity: 'CRITICAL',
      message: 'COLLECTOR_ALLOWED_SOURCES must explicitly list verified collector source keys when COLLECTORS_ENABLED="true" in production.',
    });
  }

  // 7. Observability checks
  const logLevel = (env.LOG_LEVEL || (isProd ? 'info' : 'debug')).trim().toLowerCase();
  if (isProd && logLevel === 'debug') {
    addIssue({
      category: 'Observability',
      variable: 'LOG_LEVEL',
      code: 'DEBUG_ENABLED_IN_PRODUCTION',
      severity: 'WARNING',
      message: 'LOG_LEVEL="debug" is discouraged in production; use "info" or "warn".',
    });
  }

  const criticalErrors = issues.filter((i) => i.severity === 'CRITICAL').length;
  const warnings = issues.filter((i) => i.severity === 'WARNING').length;

  return {
    status: criticalErrors === 0 ? 'VALID' : 'ENVIRONMENT_VALIDATION_FAILED',
    tier,
    nodeEnv,
    checkedAt: new Date().toISOString(),
    summary: {
      totalChecked: ENVIRONMENT_VARIABLE_CATALOG.length,
      criticalErrors,
      warnings,
    },
    categories,
    issues,
    redactedSnapshot: buildRedactedEnvSnapshot(env),
  };
}

/**
 * Throws a safe, secret-free error if production environment validation fails.
 */
export function assertProductionEnvironmentValid(
  env: Record<string, string | undefined> = process.env,
  options?: { enforceProductionRules?: boolean }
): EnvironmentValidationReport {
  const report = validateEnvironmentConfiguration(env, options);
  if (report.status === 'ENVIRONMENT_VALIDATION_FAILED') {
    const codes = report.issues
      .filter((i) => i.severity === 'CRITICAL')
      .map((i) => `${i.variable}:${i.code}`)
      .join(', ');
    const err = new Error(`ENVIRONMENT_VALIDATION_FAILED [${codes}]`);
    (err as Error & { code?: string; validationReport?: EnvironmentValidationReport }).code =
      'ENVIRONMENT_VALIDATION_FAILED';
    (err as Error & { code?: string; validationReport?: EnvironmentValidationReport }).validationReport = report;
    throw err;
  }
  return report;
}
