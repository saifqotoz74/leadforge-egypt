import fs from 'fs';
import path from 'path';

console.log('=====================================================');
console.log('CHALLENGER 1: COMPREHENSIVE EMPIRICAL VERIFICATION');
console.log('=====================================================\n');

const dossierContent = fs.readFileSync('docs/research/leads4dev-notebooklm-ux-context.md', 'utf8');

// ====================================================================
// TASK 1: VERIFY ROUTE INVENTORY (Section 3)
// ====================================================================
console.log('>>> TASK 1: ROUTE INVENTORY VERIFICATION <<<');

function getPhysicalPages(dir, base = '') {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    const relPath = path.join(base, item.name);
    if (item.isDirectory()) {
      results = results.concat(getPhysicalPages(fullPath, relPath));
    } else if (item.name === 'page.tsx') {
      results.push('src/app/' + relPath.replace(/\\/g, '/'));
    }
  }
  return results;
}

const physicalPages = getPhysicalPages('src/app').sort();

const sec3Match = dossierContent.match(/## Section 3:[\s\S]*?(?=## Section 4:)/);
if (!sec3Match) {
  console.error('FATAL: Section 3 not found in dossier!');
  process.exit(1);
}
const sec3Text = sec3Match[0];

const routeRegex = /####\s+(\d+)\.\s+([^\r\n]+)([\s\S]*?)(?=(?:####\s+\d+\.|\s*###\s+3\.|\s*## Section 4:|$))/g;
let match;
const routeAudit = [];

while ((match = routeRegex.exec(sec3Text)) !== null) {
  const num = parseInt(match[1], 10);
  const title = match[2].trim();
  const body = match[3];

  const pathMatch = body.match(/\*\*Exact Path:\*\*\s*`([^`]+)`/);
  const exactPath = pathMatch ? pathMatch[1] : null;

  // Find all file citations in the body
  const fileCitations = [];
  const citeRegex = /`(src\/app\/[^`]+)`/g;
  let cm;
  while ((cm = citeRegex.exec(body)) !== null) {
    fileCitations.push(cm[1]);
  }

  // Identify the primary page.tsx file
  const pageFile = fileCitations.find(f => f.endsWith('page.tsx')) || null;
  const pageExists = pageFile ? fs.existsSync(pageFile) : false;

  // Check line count citations if mentioned like `src/app/page.tsx` (lines 1-104)
  const lineCountMatches = [...body.matchAll(/`(src\/app\/[^`]+)`\s*\((?:lines\s*)?(\d+)[–-](\d+)\)/g)];
  const lineAudits = lineCountMatches.map(lm => {
    const fPath = lm[1];
    const startLine = parseInt(lm[2], 10);
    const endLine = parseInt(lm[3], 10);
    const exists = fs.existsSync(fPath);
    let actualLines = 0;
    if (exists) {
      actualLines = fs.readFileSync(fPath, 'utf8').split('\n').length;
    }
    return {
      fPath,
      startLine,
      endLine,
      exists,
      actualLines,
      validRange: exists && endLine <= actualLines + 5 // allow minor whitespace variance
    };
  });

  routeAudit.push({
    num,
    title,
    exactPath,
    pageFile,
    pageExists,
    fileCitations,
    lineAudits
  });
}

console.log(`Total documented routes: ${routeAudit.length}`);
console.log(`Total physical page.tsx files: ${physicalPages.length}`);

let allRoutesValid = true;
routeAudit.forEach(r => {
  const existsStr = r.pageExists ? 'EXISTS' : 'MISSING';
  if (!r.pageExists) allRoutesValid = false;
  console.log(`Route #${String(r.num).padStart(2, '0')}: [${existsStr}] ${r.exactPath.padEnd(30)} -> ${r.pageFile} ("${r.title}")`);
  if (r.lineAudits.length > 0) {
    r.lineAudits.forEach(la => {
      if (!la.validRange) {
        console.warn(`   WARNING: Line count discrepancy in ${la.fPath}: cited lines 1-${la.endLine}, actual total lines: ${la.actualLines}`);
      }
    });
  }
});

const documentedPageFiles = new Set(routeAudit.map(r => r.pageFile).filter(Boolean));
const physicalSet = new Set(physicalPages);

const missingFromDocs = physicalPages.filter(p => !documentedPageFiles.has(p));
const missingFromDisk = [...documentedPageFiles].filter(p => !physicalSet.has(p));

console.log('\nRoute Inventory Discrepancy Analysis:');
console.log('  Physical files not documented:', missingFromDocs);
console.log('  Documented files not on disk:', missingFromDisk);
console.log(`  Task 1 Status: ${allRoutesValid && missingFromDocs.length === 0 && missingFromDisk.length === 0 ? 'PASS' : 'FAIL'}`);


// ====================================================================
// TASK 2: VERIFY PRISMA DATA MODELS (Section 5)
// ====================================================================
console.log('\n>>> TASK 2: PRISMA DATA MODELS VERIFICATION (Section 5) <<<');

const schemaPath = 'prisma/schema.prisma';
if (!fs.existsSync(schemaPath)) {
  console.error(`FATAL: ${schemaPath} does not exist!`);
  process.exit(1);
}

const schemaContent = fs.readFileSync(schemaPath, 'utf8');

// Parse models and enums from schema.prisma
const prismaModels = new Map();
const prismaEnums = new Map();

const modelRegex = /model\s+(\w+)\s+{([^}]+)}/g;
let mMatch;
while ((mMatch = modelRegex.exec(schemaContent)) !== null) {
  const modelName = mMatch[1];
  const body = mMatch[2];
  const fields = new Map();
  const fieldLines = body.split('\n');
  for (const line of fieldLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const fieldName = parts[0];
      const fieldType = parts[1];
      fields.set(fieldName, { type: fieldType, raw: trimmed });
    }
  }
  prismaModels.set(modelName, fields);
}

const enumRegex = /enum\s+(\w+)\s+{([^}]+)}/g;
let eMatch;
while ((eMatch = enumRegex.exec(schemaContent)) !== null) {
  const enumName = eMatch[1];
  const body = eMatch[2];
  const values = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));
  prismaEnums.set(enumName, values);
}

console.log(`Parsed ${prismaModels.size} Prisma models and ${prismaEnums.size} enums from schema.prisma.`);
console.log('Models in schema:', [...prismaModels.keys()].sort());
console.log('Enums in schema:', [...prismaEnums.keys()].sort());

// Check Section 5 in dossier
const sec5Match = dossierContent.match(/## Section 5:[\s\S]*?(?=## Section 6:)/);
if (!sec5Match) {
  console.error('FATAL: Section 5 not found in dossier!');
  process.exit(1);
}
const sec5Text = sec5Match[0];

// Specific check: Is MockLead a separate table or isMock boolean on Lead?
const mentionsMockLeadTable = sec5Text.includes('model MockLead') || /table\s+`MockLead`/i.test(sec5Text);
const hasLeadModel = prismaModels.has('Lead');
const hasMockLeadModel = prismaModels.has('MockLead');
const leadFields = prismaModels.get('Lead');
const hasIsMockField = leadFields ? leadFields.has('isMock') : false;

console.log('\nMockLead vs isMock Verification:');
console.log('  Does schema have `MockLead` model?', hasMockLeadModel);
console.log('  Does schema have `Lead` model?', hasLeadModel);
console.log('  Does `Lead` model have `isMock` boolean field?', hasIsMockField, hasIsMockField ? `(Type: ${leadFields.get('isMock').type})` : '');
console.log('  Does Section 5 explain isMock flag vs separate model?');

// Check Section 5 explanation of isMock
const isMockExplanation = sec5Text.includes('isMock') || sec5Text.includes('MockLead');
console.log('  Section 5 references isMock / mock leads:', isMockExplanation);

// Check core models listed in original prompt:
// Lead, MockLead, LeadAvailabilityStatus, LeadClaim, DeveloperCreditAccount, CreditTransaction, Plan, Subscription, Payment, LeadFeedback, DuplicateCandidate, AuditLog
const modelsToCheck = [
  'Lead',
  'LeadAvailabilityStatus',
  'LeadClaim',
  'DeveloperCreditAccount',
  'CreditTransaction',
  'Plan',
  'Subscription',
  'Payment',
  'LeadFeedback',
  'DuplicateCandidate',
  'AuditLog'
];

console.log('\nChecking Core Entities against Prisma:');
modelsToCheck.forEach(m => {
  const inPrisma = prismaModels.has(m) ? 'MODEL' : (prismaEnums.has(m) ? 'ENUM' : 'MISSING');
  console.log(`  Entity: ${m.padEnd(25)} -> ${inPrisma}`);
});


// ====================================================================
// TASK 3: VERIFY GAPS EVIDENCE (GAP-01 through GAP-15)
// ====================================================================
console.log('\n>>> TASK 3: GAPS EVIDENCE VERIFICATION (GAP-01 to GAP-15) <<<');

// Check GAP-01 specifically:
// "emailVerified: null in src/app/api/auth/register/route.ts:98 and rejection in src/lib/claims/service.ts:213"
console.log('\n--- Checking GAP-01 ---');
const registerRoutePath = 'src/app/api/auth/register/route.ts';
if (fs.existsSync(registerRoutePath)) {
  const regLines = fs.readFileSync(registerRoutePath, 'utf8').split('\n');
  console.log(`File: ${registerRoutePath} (Total lines: ${regLines.length})`);
  regLines.forEach((l, idx) => {
    if (l.includes('emailVerified') || (idx >= 90 && idx <= 105)) {
      console.log(`  Line ${idx + 1}: ${l}`);
    }
  });
} else {
  console.error(`  MISSING FILE: ${registerRoutePath}`);
}

const claimsServicePath = 'src/lib/claims/service.ts';
if (fs.existsSync(claimsServicePath)) {
  const claimLines = fs.readFileSync(claimsServicePath, 'utf8').split('\n');
  console.log(`File: ${claimsServicePath} (Total lines: ${claimLines.length})`);
  claimLines.forEach((l, idx) => {
    if (l.includes('emailVerified') || (idx >= 205 && idx <= 220)) {
      console.log(`  Line ${idx + 1}: ${l}`);
    }
  });
} else {
  console.error(`  MISSING FILE: ${claimsServicePath}`);
}

// Extract GAP-01 to GAP-15 from Section 12
console.log('\n--- Extracting and Auditing GAP-01 to GAP-15 from Dossier ---');
const sec12Match = dossierContent.match(/## Section 12:[\s\S]*?(?=## Section 13:)/);
if (!sec12Match) {
  console.error('FATAL: Section 12 not found in dossier!');
  process.exit(1);
}
const sec12Text = sec12Match[0];

const gapRegex = /###\s+(GAP-\d+):\s+([^\r\n]+)([\s\S]*?)(?=(?:###\s+GAP-\d+:|\s*## Section 13:|$))/g;
let gapMatch;
const gapAudits = [];

while ((gapMatch = gapRegex.exec(sec12Text)) !== null) {
  const gapId = gapMatch[1];
  const gapTitle = gapMatch[2].trim();
  const gapBody = gapMatch[3];

  // Extract file citations
  const citations = [];
  const citeRegex = /`([^`]+\.[a-zA-Z0-9]+)(?::(\d+)(?:[–-](\d+))?)?`/g;
  let cm;
  while ((cm = citeRegex.exec(gapBody)) !== null) {
    const rawPath = cm[1];
    const startLine = cm[2] ? parseInt(cm[2], 10) : null;
    const endLine = cm[3] ? parseInt(cm[3], 10) : startLine;

    // Filter to repo source files
    if (rawPath.startsWith('src/') || rawPath.startsWith('prisma/') || rawPath.startsWith('docs/')) {
      const exists = fs.existsSync(rawPath);
      let snippetValid = false;
      let actualContent = '';
      if (exists && startLine) {
        const fileLines = fs.readFileSync(rawPath, 'utf8').split('\n');
        const s = Math.max(0, startLine - 1);
        const e = Math.min(fileLines.length, (endLine || startLine));
        actualContent = fileLines.slice(s, e).join('\n').trim();
      }
      citations.push({
        rawPath,
        startLine,
        endLine,
        exists,
        actualContent
      });
    }
  }

  gapAudits.push({
    gapId,
    gapTitle,
    citations,
    rawText: gapBody
  });
}

console.log(`Found ${gapAudits.length} GAPs in Section 12:`);
gapAudits.forEach(g => {
  console.log(`\n[${g.gapId}] ${g.gapTitle}`);
  if (g.citations.length === 0) {
    console.log('  No direct source code citation parsed.');
  } else {
    g.citations.forEach(c => {
      console.log(`  Citation: ${c.rawPath}${c.startLine ? ':' + c.startLine : ''} (Exists: ${c.exists})`);
      if (c.exists && c.actualContent) {
        console.log(`    Code around line ${c.startLine}: "${c.actualContent.replace(/\s+/g, ' ').substring(0, 80)}..."`);
      }
    });
  }
});
