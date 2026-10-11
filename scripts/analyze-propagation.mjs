import fs from 'fs';
import path from 'path';

const routes = [
  'src/app/page.tsx',
  'src/app/login/page.tsx',
  'src/app/register/page.tsx',
  'src/app/pricing/page.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/dashboard/page.tsx',
  'src/app/dashboard/analytics/page.tsx',
  'src/app/leads/page.tsx',
  'src/app/leads/[id]/page.tsx',
  'src/app/my-leads/page.tsx',
  'src/app/pipeline/page.tsx',
  'src/app/credits/page.tsx',
  'src/app/subscription/page.tsx',
  'src/app/settings/page.tsx',
  'src/app/design-system/page.tsx',
  'src/app/admin/page.tsx',
  'src/app/admin/analytics/page.tsx',
  'src/app/admin/duplicates/page.tsx',
  'src/app/admin/leads/page.tsx',
  'src/app/admin/matching/page.tsx',
  'src/app/admin/plans/page.tsx',
  'src/app/admin/quality/page.tsx',
  'src/app/admin/reports/page.tsx',
  'src/app/admin/rules/page.tsx',
  'src/app/admin/sources/page.tsx',
  'src/app/admin/users/page.tsx',
];

const sharedComponents = [
  'StatTile',
  'MatchRow',
  'PlanSummary',
  'BarList',
  'ChipList',
  'MetaList',
  'CodeChip',
  'IdChip',
  'OpportunityBadge',
  'QualityIndicator',
  'StageBadge',
  'CreditChip',
  'LeadCard',
  'LeadRow',
];

const report = {};

for (const r of routes) {
  if (!fs.existsSync(r)) continue;
  const content = fs.readFileSync(r, 'utf8');

  const usedComponents = [];
  for (const comp of sharedComponents) {
    if (new RegExp(`\\b${comp}\\b`).test(content)) {
      usedComponents.push(comp);
    }
  }

  // Hand-built patterns
  const handBuilt = [];

  // Check for hand-built StatTile (cards with big numbers, e.g. text-2xl or text-3xl font-bold)
  if (!usedComponents.includes('StatTile') && /text-[23]xl font-(bold|semibold)/.test(content)) {
    handBuilt.push('StatTile (builds KPI/metric tiles by hand)');
  }

  // Check for hand-built chips / tags (+N overflow or flex-wrap chips)
  if (!usedComponents.includes('ChipList') && (/\+\d+/.test(content) || /rounded-full.*px-2.*py-/.test(content))) {
    handBuilt.push('ChipList (builds inline chips / +N overflow badges by hand)');
  }

  // Check for hand-built meta separators (middle dot or bullet or slash)
  if (!usedComponents.includes('MetaList') && (/·|•|—/.test(content) || /flex items-center gap-\d text-caption/.test(content))) {
    handBuilt.push('MetaList (builds meta line with custom gaps or manual glyph separators)');
  }

  // Check for hand-built progress / funnel bars
  if (!usedComponents.includes('BarList') && /h-[12] bg-.*rounded-full/.test(content)) {
    handBuilt.push('BarList (builds visual progress or distribution bars by hand)');
  }

  // Check for hand-built Lead row/card
  if (!usedComponents.includes('MatchRow') && !usedComponents.includes('LeadRow') && !usedComponents.includes('LeadCard')) {
    if (/lead|opportunity/i.test(r) && /border.*rounded.*p-/.test(content)) {
      handBuilt.push('MatchRow / LeadRow / LeadCard (renders lead items via ad-hoc markup)');
    }
  }

  // Check for hand-built code/id chip
  if (!usedComponents.includes('CodeChip') && !usedComponents.includes('IdChip') && /font-mono/.test(content)) {
    handBuilt.push('CodeChip / IdChip (styles raw IDs / codes with font-mono without shared component)');
  }

  // Check for font-mono violations
  const fontMonoMatches = (content.match(/font-mono/g) || []).length;

  report[r] = {
    usedComponents,
    handBuilt,
    fontMonoCount: fontMonoMatches,
  };
}

console.log(JSON.stringify(report, null, 2));
