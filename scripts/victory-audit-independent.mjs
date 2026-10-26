import fs from 'node:fs';
import path from 'node:path';

const repoRoot = 'e:/Antigravity Projects/Leads';
const dossierPath = path.join(repoRoot, 'docs/research/leads4dev-notebooklm-ux-context.md');

console.log('=== INDEPENDENT VICTORY AUDIT ENGINE ===');

if (!fs.existsSync(dossierPath)) {
  console.error('FAIL: Deliverable does not exist at ' + dossierPath);
  process.exit(1);
}

const content = fs.readFileSync(dossierPath, 'utf8');
const lines = content.split('\n');
console.log(`Dossier loaded: ${lines.length} lines, ${content.length} bytes, ${content.split(/\s+/).length} words.`);

const report = {
  sections: [],
  routes: { required: 34, found: 0, missing: [] },
  models: { required: 12, found: 0, missing: [] },
  journeys: { required: ['Journey A', 'Journey B', 'Journey C', 'Journey D', 'Journey E', 'Journey F', 'Journey G', 'Journey H', 'Journey I'], found: [], missing: [] },
  mermaids: { count: 0, validSyntax: 0, errors: [] },
  gaps: { required: Array.from({ length: 15 }, (_, i) => `GAP-${String(i + 1).padStart(2, '0')}`), found: [], missing: [] },
  truthTaxonomy: { counts: {}, citationsCount: 0, invalidCitations: [] },
  businessRules: { count: 0 },
  localization: { arabicWordCount: 0 }
};

// 1. Verify 16 Sections
for (let s = 1; s <= 16; s++) {
  const sectionHeadingRegex = new RegExp(`## Section ${s}:`, 'i');
  const found = lines.some((l) => sectionHeadingRegex.test(l));
  if (found) {
    report.sections.push(`Section ${s}: PRESENT`);
  } else {
    report.sections.push(`Section ${s}: MISSING`);
  }
}

// 2. Verify all 34 page.tsx routes are documented in Section 3
const appDir = path.join(repoRoot, 'src/app');
function getPageRoutes(dir, base = '') {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getPageRoutes(path.join(dir, entry.name), rel));
    } else if (entry.name === 'page.tsx') {
      const routePath = ('/' + base).replace(/\\/g, '/');
      results.push({
        file: path.join('src/app', rel).replace(/\\/g, '/'),
        route: routePath === '/' ? '/' : routePath
      });
    }
  }
  return results;
}

const actualRoutes = getPageRoutes(appDir);
report.routes.totalPhysical = actualRoutes.length;

for (const r of actualRoutes) {
  // Check if file or route is mentioned in the dossier
  const fileMentioned = content.includes(r.file);
  const routeMentioned = content.includes(r.route);
  if (fileMentioned || routeMentioned) {
    report.routes.found++;
  } else {
    report.routes.missing.push(r);
  }
}

// 3. Verify 12 core models from R1.5
const coreModels = [
  'Lead',
  'MockLead',
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

for (const model of coreModels) {
  if (content.includes(`\`${model}\``) || content.includes(`**${model}**`) || content.includes(`model ${model}`)) {
    report.models.found++;
  } else {
    report.models.missing.push(model);
  }
}

// 4. Verify Journeys A through I
for (const j of report.journeys.required) {
  if (content.includes(j)) {
    report.journeys.found.push(j);
  } else {
    report.journeys.missing.push(j);
  }
}

// 5. Verify Mermaid diagrams
const mermaidBlocks = content.match(/```mermaid[\s\S]*?```/g) || [];
report.mermaids.count = mermaidBlocks.length;
for (let i = 0; i < mermaidBlocks.length; i++) {
  const block = mermaidBlocks[i].replace(/```mermaid\n?/, '').replace(/```$/, '').trim();
  const firstLine = block.split('\n')[0].trim();
  if (firstLine.startsWith('sequenceDiagram') || firstLine.startsWith('graph') || firstLine.startsWith('flowchart') || firstLine.startsWith('stateDiagram') || firstLine.startsWith('classDiagram')) {
    report.mermaids.validSyntax++;
  } else {
    report.mermaids.errors.push(`Diagram #${i + 1} invalid starting syntax: "${firstLine}"`);
  }
}

// 6. Verify GAPs GAP-01 to GAP-15
for (const gap of report.gaps.required) {
  if (content.includes(`**${gap}**`) || content.includes(`### ${gap}`) || content.includes(`\`${gap}\``) || content.includes(gap)) {
    report.gaps.found.push(gap);
  } else {
    report.gaps.missing.push(gap);
  }
}

// 7. Verify Truth Taxonomy
const truthClasses = [
  '[Verified implementation]',
  '[Observed interface]',
  '[Documented intention]',
  '[Inference]',
  '[Unknown / not verified]'
];

for (const tc of truthClasses) {
  const matches = (content.match(new RegExp(tc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  report.truthTaxonomy.counts[tc] = matches;
}

// 8. Citations verification: check repository-relative paths cited in markdown
const pathMatches = content.match(/`(src\/[a-zA-Z0-9_/.-]+|prisma\/[a-zA-Z0-9_/.-]+|docs\/[a-zA-Z0-9_/.-]+)`/g) || [];
const uniqueCitedPaths = [...new Set(pathMatches.map((p) => p.replace(/`/g, '').split(':')[0]))];
report.truthTaxonomy.citationsCount = uniqueCitedPaths.length;

for (const p of uniqueCitedPaths) {
  const fullPath = path.join(repoRoot, p);
  if (!fs.existsSync(fullPath)) {
    report.truthTaxonomy.invalidCitations.push(p);
  }
}

// 9. Business Rules (BR-01 through BR-22)
for (let br = 1; br <= 22; br++) {
  const brTag = `BR-${String(br).padStart(2, '0')}`;
  if (content.includes(brTag)) {
    report.businessRules.count++;
  }
}

// 10. Arabic text check
const arabicMatches = content.match(/[\u0600-\u06FF]+/g) || [];
report.localization.arabicWordCount = arabicMatches.length;

console.log('\n--- AUDIT SUMMARY RESULTS ---');
console.log('Sections 1-16 Check:', report.sections.every((s) => s.endsWith('PRESENT')) ? 'ALL 16 PRESENT' : report.sections);
console.log(`Routes Check: ${report.routes.found}/${report.routes.totalPhysical} routes found in dossier (Missing: ${report.routes.missing.length})`);
console.log(`Core Models Check: ${report.models.found}/${report.models.required} models verified (Missing: ${report.models.missing.join(', ') || 'None'})`);
console.log(`Journeys A-I Check: ${report.journeys.found.length}/${report.journeys.required.length} journeys verified (Missing: ${report.journeys.missing.join(', ') || 'None'})`);
console.log(`Mermaid Diagrams: ${report.mermaids.count} diagrams found, ${report.mermaids.validSyntax} valid diagrams (Errors: ${report.mermaids.errors.join(', ') || 'None'})`);
console.log(`GAPs Catalog Check: ${report.gaps.found.length}/${report.gaps.required.length} GAPs verified (Missing: ${report.gaps.missing.join(', ') || 'None'})`);
console.log('Truth Taxonomy Counts:', report.truthTaxonomy.counts);
console.log(`Repository-relative citations: ${uniqueCitedPaths.length} unique paths verified against disk.`);
console.log(`Invalid Citations count: ${report.truthTaxonomy.invalidCitations.length}`);
if (report.truthTaxonomy.invalidCitations.length > 0) {
  console.log('Invalid citations list:', report.truthTaxonomy.invalidCitations);
}
console.log(`Business Rules verified: ${report.businessRules.count}/22`);
console.log(`Arabic Words in Dossier: ${report.localization.arabicWordCount}`);

fs.writeFileSync(path.join(repoRoot, '.agents/teamwork/victory_auditor_1/audit_metrics.json'), JSON.stringify(report, null, 2));
