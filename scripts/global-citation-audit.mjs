import fs from 'fs';

console.log('=== GLOBAL CITATION AUDIT OF DOSSIER ===\n');

const dossier = fs.readFileSync('docs/research/leads4dev-notebooklm-ux-context.md', 'utf8');

// Match backticked file paths like `src/...`, `prisma/...`, `docs/...`
const citationRegex = /`((?:src|prisma|docs)\/[^`\s]+)`/g;
let match;
const citations = new Map();

while ((match = citationRegex.exec(dossier)) !== null) {
  const raw = match[1];
  // Separate path from line numbers or section identifiers
  // e.g. src/app/page.tsx:10-20 or src/components/TopBar.tsx:Section 2
  let cleanPath = raw;
  let suffix = '';
  const colonIdx = raw.indexOf(':');
  if (colonIdx !== -1) {
    cleanPath = raw.substring(0, colonIdx);
    suffix = raw.substring(colonIdx + 1);
  }
  // Trim trailing punctuation like . or ,
  cleanPath = cleanPath.replace(/[,\.]$/, '');

  if (!citations.has(cleanPath)) {
    citations.set(cleanPath, { count: 0, occurrences: [], suffixes: [] });
  }
  const entry = citations.get(cleanPath);
  entry.count++;
  if (suffix) entry.suffixes.push(suffix);
}

console.log(`Found ${citations.size} unique repo-relative files cited across the entire document.\n`);

const missing = [];
const existing = [];

for (const [fPath, data] of citations.entries()) {
  const exists = fs.existsSync(fPath);
  if (exists) {
    existing.push({ fPath, count: data.count });
  } else {
    // Check if file exists under another folder
    const fileName = fPath.split('/').pop();
    missing.push({ fPath, count: data.count, fileName, suffixes: data.suffixes });
  }
}

console.log(`Verified Existing Files (${existing.length}):`);
existing.sort((a, b) => b.count - a.count).forEach(e => {
  console.log(`  [OK] ${e.fPath.padEnd(55)} (cited ${e.count}x)`);
});

console.log(`\nDiscrepant / Missing File Paths (${missing.length}):`);
missing.forEach(m => {
  console.log(`  [MISSING] ${m.fPath.padEnd(50)} (cited ${m.count}x)`);
});
