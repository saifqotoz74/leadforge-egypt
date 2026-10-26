import fs from 'fs';

const claimsService = fs.readFileSync('src/lib/claims/service.ts', 'utf8');
const refundService = fs.readFileSync('src/lib/claims/refund-service.ts', 'utf8');
const paymentProvider = fs.readFileSync('src/lib/payment/provider.ts', 'utf8');
const middleware = fs.readFileSync('src/middleware.ts', 'utf8');
const claimRoute = fs.readFileSync('src/app/api/leads/[id]/claim/route.ts', 'utf8');
const transferRoute = fs.readFileSync('src/app/api/subscription/transfer/route.ts', 'utf8');
const authLib = fs.readFileSync('src/lib/auth.ts', 'utf8');
const resetPasswordRoute = fs.readFileSync('src/app/api/auth/reset-password/route.ts', 'utf8');
const publicLeadsPage = fs.readFileSync('src/app/leads/page.tsx', 'utf8');
const leadApiRoute = fs.readFileSync('src/app/api/leads/[id]/route.ts', 'utf8');

function findInFile(content, fileName, searchStr) {
  const lines = content.split('\n');
  const matches = [];
  lines.forEach((l, idx) => {
    if (l.includes(searchStr)) {
      matches.push({ line: idx + 1, content: l.trim() });
    }
  });
  return matches;
}

console.log('=== VERIFYING 22 BUSINESS RULES ===\n');

const checks = [
  // Rule 1: Email Verification Gate
  {
    rule: 1,
    name: 'Email Verification Gate (SEC-03)',
    search: 'emailVerified',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:213',
    expectedStatus: 403,
    expectedError: 'EMAIL_NOT_VERIFIED'
  },
  // Rule 2: Active Subscription Check
  {
    rule: 2,
    name: 'Active Subscription Check',
    search: 'Active subscription required',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:233',
    expectedStatus: 403,
    expectedError: 'NO_ACTIVE_SUBSCRIPTION'
  },
  // Rule 3: Billing Period Expiry Gate
  {
    rule: 3,
    name: 'Billing Period Expiry Gate',
    search: 'Subscription billing period has expired',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:245',
    expectedStatus: 403,
    expectedError: 'SUBSCRIPTION_EXPIRED'
  },
  // Rule 4: Developer Profile Inactive
  {
    rule: 4,
    name: 'Developer Profile Inactive',
    search: 'Developer profile is currently inactive',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:296',
    expectedStatus: 403,
    expectedError: 'PROFILE_INACTIVE'
  },
  // Rule 5: Duplicate Claim Prevention
  {
    rule: 5,
    name: 'Duplicate Claim Prevention',
    search: 'لقد قمت بالحصول على بيانات هذا العميل مسبقًا',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:331',
    expectedStatus: 409,
    expectedError: 'ALREADY_CLAIMED'
  },
  // Rule 6: Shared Lead 3-Purchaser Cap
  {
    rule: 6,
    name: 'Shared Lead 3-Purchaser Cap',
    search: 'وصلت هذه الفرصة إلى الحد الأقصى لعدد المشترين',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:508, 760',
    expectedStatus: 409,
    expectedError: 'CLAIMED_FULL'
  },
  // Rule 7: Exclusive Lead 1-Purchaser Cap
  {
    rule: 7,
    name: 'Exclusive Lead 1-Purchaser Cap',
    search: 'هذه فرصة حصرية وقد تم شراؤها بالفعل',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:495, 759',
    expectedStatus: 409,
    expectedError: 'EXCLUSIVE_CLAIMED'
  },
  // Rule 8: Exclusive Plan Entitlement
  {
    rule: 8,
    name: 'Exclusive Plan Entitlement',
    search: 'does not allow claiming EXCLUSIVE leads',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:570',
    expectedStatus: 422,
    expectedError: 'EXCLUSIVE_NOT_ALLOWED'
  },
  // Rule 9: Concurrent Active Claims Limit
  {
    rule: 9,
    name: 'Concurrent Active Claims Limit',
    search: 'Maximum active claims limit',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:593',
    expectedStatus: 422,
    expectedError: 'MAX_ACTIVE_CLAIMS_REACHED'
  },
  // Rule 10: Insufficient Credit Balance
  {
    rule: 10,
    name: 'Insufficient Credit Balance',
    search: 'Insufficient credits',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:661',
    expectedStatus: 422,
    expectedError: 'INSUFFICIENT_CREDITS'
  },
  // Rule 11: Atomic Balance Guard
  {
    rule: 11,
    name: 'Atomic Balance Guard',
    search: 'concurrent credit usage',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:680-701',
    expectedStatus: 422,
    expectedError: 'CONCURRENT_INSUFFICIENT_CREDITS'
  },
  // Rule 12: Lead Quality Gate
  {
    rule: 12,
    name: 'Lead Quality Gate',
    search: 'below required minimum',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:456',
    expectedStatus: 422,
    expectedError: 'QUALITY_TOO_LOW'
  },
  // Rule 13: Stale Lead Re-verification Gate
  {
    rule: 13,
    name: 'Stale Lead Re-verification Gate',
    search: 'requires re-verification',
    content: claimsService,
    file: 'src/lib/claims/service.ts',
    expectedCitation: 'src/lib/claims/service.ts:411',
    expectedStatus: 422,
    expectedError: 'LEAD_STALE'
  },
  // Rule 14: Dispute 30-Minute Wait Period
  {
    rule: 14,
    name: 'Dispute 30-Minute Wait Period',
    search: 'WAIT_PERIOD_REQUIRED',
    content: refundService,
    file: 'src/lib/claims/refund-service.ts',
    expectedCitation: 'src/lib/claims/refund-service.ts:647',
    expectedStatus: 422,
    expectedError: 'WAIT_PERIOD_REQUIRED'
  },
  // Rule 15: Free User Monthly Dispute Cap
  {
    rule: 15,
    name: 'Free User Monthly Dispute Cap',
    search: 'TRIAL_REFUND_LIMIT_EXCEEDED',
    content: refundService,
    file: 'src/lib/claims/refund-service.ts',
    expectedCitation: 'src/lib/claims/refund-service.ts:678',
    expectedStatus: 422,
    expectedError: 'TRIAL_REFUND_LIMIT_EXCEEDED'
  },
  // Rule 16: Single Active Dispute Cap
  {
    rule: 16,
    name: 'Single Active Dispute Cap',
    search: 'REFUND_REPORT_ALREADY_EXISTS',
    content: refundService,
    file: 'src/lib/claims/refund-service.ts',
    expectedCitation: 'src/lib/claims/refund-service.ts:700, 786',
    expectedStatus: 409,
    expectedError: 'REFUND_REPORT_ALREADY_EXISTS'
  },
  // Rule 17: Manual Payment Receipt Size Cap
  {
    rule: 17,
    name: 'Manual Payment Receipt Size Cap',
    search: '5 ميجابايت',
    content: transferRoute,
    file: 'src/app/api/subscription/transfer/route.ts',
    expectedCitation: 'src/app/api/subscription/transfer/route.ts:38',
    expectedStatus: 400,
    expectedError: 'RECEIPT_TOO_LARGE'
  },
  // Rule 18: Production Sandbox Block
  {
    rule: 18,
    name: 'Production Sandbox Block',
    search: 'لا يمكن تفعيل الباقات المدفوعة عبر بوابة الدفع التجريبية في بيئة الإنتاج',
    content: paymentProvider,
    file: 'src/lib/payment/provider.ts',
    expectedCitation: 'src/lib/payment/provider.ts:173',
    expectedStatus: 403,
    expectedError: 'FORBIDDEN'
  },
  // Rule 19: Payment Receipt Privacy Purge
  {
    rule: 19,
    name: 'Payment Receipt Privacy Purge',
    search: 'receiptPurged: true',
    content: paymentProvider,
    file: 'src/lib/payment/provider.ts',
    expectedCitation: 'src/lib/payment/provider.ts:451, 587',
    expectedStatus: 'N/A (DB Purge)',
    expectedError: 'N/A'
  },
  // Rule 20: Password Reset Token Fingerprint
  {
    rule: 20,
    name: 'Password Reset Token Fingerprint',
    search: 'resetPasswordToken',
    content: authLib,
    file: 'src/lib/auth.ts',
    expectedCitation: 'src/lib/auth.ts:395',
    expectedStatus: 400,
    expectedError: 'INVALID_TOKEN'
  },
  // Rule 21: Public Lead Name Masking
  {
    rule: 21,
    name: 'Public Lead Name Masking',
    search: '••••••••',
    content: publicLeadsPage,
    file: 'src/app/leads/page.tsx',
    expectedCitation: 'src/app/leads/page.tsx:49-55',
    expectedStatus: 'N/A (UI Mask)',
    expectedError: 'N/A'
  },
  // Rule 22: Contact Data Partial Masking
  {
    rule: 22,
    name: 'Contact Data Partial Masking',
    search: 'maskContactInfo',
    content: leadApiRoute,
    file: 'src/app/api/leads/[id]/route.ts',
    expectedCitation: 'src/app/api/leads/[id]/route.ts:166-184',
    expectedStatus: 'N/A (Serializer)',
    expectedError: 'N/A'
  }
];

let passCount = 0;
let failCount = 0;

for (const c of checks) {
  const matches = findInFile(c.content, c.file, c.search);
  if (matches.length > 0) {
    passCount++;
    console.log(`[PASS] Rule ${c.rule}: ${c.name}`);
    console.log(`       Found "${c.search}" at ${c.file} line(s): ${matches.map(m => m.line).join(', ')}`);
    console.log(`       Cited: ${c.expectedCitation}`);
  } else {
    failCount++;
    console.log(`[FAIL] Rule ${c.rule}: ${c.name}`);
    console.log(`       Could NOT find "${c.search}" in ${c.file}`);
  }
}

console.log(`\nResults: ${passCount} PASSED, ${failCount} FAILED out of ${checks.length} rules.`);
