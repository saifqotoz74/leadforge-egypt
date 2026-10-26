import fs from 'fs';
import path from 'path';

console.log('=== DEEP AUDIT OF GAPS 01 TO 15 & SECTION 5 ===\n');

const dossier = fs.readFileSync('docs/research/leads4dev-notebooklm-ux-context.md', 'utf8');

// 1. Inspect GAP text verbatim
const sec12Match = dossier.match(/## Section 12:[\s\S]*?(?=## Section 13:)/);
const sec12 = sec12Match[0];

const gaps = [];
const gapHeaders = [...sec12.matchAll(/###\s+(GAP-\d+):\s+([^\r\n]+)/g)];
for (let i = 0; i < gapHeaders.length; i++) {
  const currentHeader = gapHeaders[i];
  const nextHeader = gapHeaders[i + 1];
  const startIdx = currentHeader.index;
  const endIdx = nextHeader ? nextHeader.index : sec12.length;
  const body = sec12.substring(startIdx, endIdx);
  gaps.push({
    id: currentHeader[1],
    title: currentHeader[2].trim(),
    body
  });
}

console.log(`Parsed ${gaps.length} GAPs from Section 12.`);

for (const g of gaps) {
  console.log(`\n==================================================`);
  console.log(`[${g.id}] ${g.title}`);
  console.log(`==================================================`);
  
  // Extract all backticked potential paths
  const matches = [...g.body.matchAll(/`([^`\s]+(?:\.ts|\.tsx|\.prisma|\.md|\.json|\.css)[^`]*)`/g)];
  for (const m of matches) {
    const fullCitation = m[1];
    let filePath = fullCitation;
    let lineInfo = null;
    
    // Check if there is :line
    const colonIdx = fullCitation.indexOf(':');
    if (colonIdx !== -1) {
      filePath = fullCitation.substring(0, colonIdx);
      lineInfo = fullCitation.substring(colonIdx + 1);
    }
    
    const exists = fs.existsSync(filePath);
    console.log(`  Cited: ${fullCitation} -> Path: ${filePath} | Exists: ${exists} | LineInfo: ${lineInfo || 'None'}`);
    if (exists && lineInfo) {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');
      // If lineInfo is a number or range
      const numMatch = lineInfo.match(/^(\d+)(?:[–-](\d+))?/);
      if (numMatch) {
        const start = parseInt(numMatch[1], 10);
        const end = numMatch[2] ? parseInt(numMatch[2], 10) : start;
        const slice = lines.slice(Math.max(0, start - 2), Math.min(lines.length, end + 2));
        console.log(`    Content [lines ${Math.max(1, start - 1)} to ${Math.min(lines.length, end + 1)}]:`);
        slice.forEach((sl, idx) => {
          const lNum = Math.max(1, start - 1) + idx;
          console.log(`      ${lNum}: ${sl.trimEnd()}`);
        });
      } else {
        console.log(`    LineInfo is not purely numeric: ${lineInfo}`);
      }
    }
  }
}
