import fs from 'fs';

console.log('=== VERIFYING SECTION 5 MODELS & FIELDS AGAINST PRISMA ===\n');

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

// Parse schema models
const models = new Map();
const enums = new Map();

const modelRegex = /model\s+(\w+)\s+{([^}]+)}/g;
let m;
while ((m = modelRegex.exec(schema)) !== null) {
  const modelName = m[1];
  const fields = new Set();
  m[2].split('\n').forEach(line => {
    const t = line.trim();
    if (t && !t.startsWith('//') && !t.startsWith('@@')) {
      const fieldName = t.split(/\s+/)[0];
      fields.add(fieldName);
    }
  });
  models.set(modelName, fields);
}

const enumRegex = /enum\s+(\w+)\s+{([^}]+)}/g;
let e;
while ((e = enumRegex.exec(schema)) !== null) {
  const enumName = e[1];
  const vals = new Set();
  e[2].split('\n').forEach(line => {
    const t = line.trim();
    if (t && !t.startsWith('//')) {
      vals.add(t);
    }
  });
  enums.set(enumName, vals);
}

const testSpecs = [
  {
    model: 'Lead',
    fields: [
      'businessName', 'category', 'governorate', 'city', 'address',
      'phone', 'phones', 'hasPhone', 'email', 'website', 'facebook', 'instagram',
      'websiteStatus', 'score', 'temperature', 'accessType',
      'currentPurchasers', 'availableForClaim', 'isMock', 'isCanonical'
    ]
  },
  {
    enum: 'LeadAvailabilityStatus',
    values: [
      'AVAILABLE', 'CLAIMED_FULL', 'REQUIRES_VERIFICATION', 'STALE',
      'INVALID', 'CLOSED', 'DUPLICATE', 'NOT_SALEABLE', 'ARCHIVED'
    ]
  },
  {
    model: 'LeadClaim',
    fields: [
      'leadId', 'userId', 'developerId', 'status', 'accessType',
      'pipelineStatus', 'creditsCharged', 'creditsRefunded',
      'accessGranted', 'expiresAt', 'idempotencyKey'
    ]
  },
  {
    model: 'DeveloperCreditAccount',
    fields: [
      'balance', 'reservedBalance', 'version',
      'lifetimePurchased', 'lifetimeSpent', 'lifetimeRefunded'
    ]
  },
  {
    model: 'CreditTransaction',
    fields: ['type', 'amount', 'balanceBefore', 'balanceAfter', 'idempotencyKey']
  },
  {
    model: 'Plan',
    fields: ['slug', 'priceEgp', 'monthlyCredits', 'allowsExclusive', 'maxConcurrentClaims']
  },
  {
    model: 'Subscription',
    fields: ['userId', 'planId', 'status', 'credits', 'currentPeriodEnd']
  },
  {
    model: 'Payment',
    fields: ['amountEgp', 'provider', 'status', 'metadata']
  },
  {
    model: 'LeadFeedback',
    fields: ['category', 'reasonCode', 'useful', 'type', 'metadata']
  },
  {
    model: 'DuplicateCandidate',
    fields: ['matchedLeadId', 'candidateLeadId', 'sourceRecordId', 'decision', 'status']
  },
  {
    model: 'AuditLog',
    fields: ['userId', 'ipAddress', 'details']
  }
];

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

for (const spec of testSpecs) {
  if (spec.model) {
    const modelExists = models.has(spec.model);
    console.log(`\nModel [${spec.model}]: Exists in schema? ${modelExists}`);
    totalChecks++;
    if (modelExists) passedChecks++; else failedChecks++;

    if (modelExists) {
      const fieldSet = models.get(spec.model);
      for (const f of spec.fields) {
        const hasField = fieldSet.has(f);
        totalChecks++;
        if (hasField) {
          console.log(`  [PASS] Field ${spec.model}.${f} exists`);
          passedChecks++;
        } else {
          console.log(`  [FAIL] Field ${spec.model}.${f} NOT found in model!`);
          failedChecks++;
        }
      }
    }
  } else if (spec.enum) {
    const enumExists = enums.has(spec.enum);
    console.log(`\nEnum [${spec.enum}]: Exists in schema? ${enumExists}`);
    totalChecks++;
    if (enumExists) passedChecks++; else failedChecks++;

    if (enumExists) {
      const valSet = enums.get(spec.enum);
      for (const v of spec.values) {
        const hasVal = valSet.has(v);
        totalChecks++;
        if (hasVal) {
          console.log(`  [PASS] Enum value ${spec.enum}.${v} exists`);
          passedChecks++;
        } else {
          console.log(`  [FAIL] Enum value ${spec.enum}.${v} NOT found in enum!`);
          failedChecks++;
        }
      }
    }
  }
}

console.log(`\n==================================================`);
console.log(`Total Checks: ${totalChecks} | Passed: ${passedChecks} | Failed: ${failedChecks}`);
console.log(`Section 5 Schema Compliance: ${failedChecks === 0 ? '100% PERFECT' : 'DISCREPANCIES FOUND'}`);
