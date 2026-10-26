import fs from 'fs';

console.log('=== DETAILED ROUTE INVENTORY AUDIT ===\n');

const dossier = fs.readFileSync('docs/research/leads4dev-notebooklm-ux-context.md', 'utf8');

const sec3Match = dossier.match(/## Section 3:[\s\S]*?(?=## Section 4:)/);
const sec3Text = sec3Match[0];

const routeRegex = /####\s+(\d+)\.\s+([^\r\n]+)([\s\S]*?)(?=(?:####\s+\d+\.|\s*###\s+3\.|\s*## Section 4:|$))/g;
let match;
const routeData = [];

while ((match = routeRegex.exec(sec3Text)) !== null) {
  const num = parseInt(match[1], 10);
  const title = match[2].trim();
  const body = match[3];

  const pathMatch = body.match(/\*\*Exact Path:\*\*\s*`([^`]+)`/);
  const exactPath = pathMatch ? pathMatch[1] : null;

  // Find all file citations in the body
  const fileMatches = [...body.matchAll(/`(src\/app\/[^`]+page\.tsx)`/g)];
  const pageFile = fileMatches.length > 0 ? fileMatches[0][1] : null;

  // Line ranges
  const lineRangeMatch = body.match(/`src\/app\/[^`]+page\.tsx`\s*\((?:lines\s*)?(\d+)[–-](\d+)\)/);
  let startLine = null;
  let endLine = null;
  if (lineRangeMatch) {
    startLine = parseInt(lineRangeMatch[1], 10);
    endLine = parseInt(lineRangeMatch[2], 10);
  }

  const exists = pageFile ? fs.existsSync(pageFile) : false;
  let actualLines = 0;
  if (exists) {
    actualLines = fs.readFileSync(pageFile, 'utf8').split('\n').length;
  }

  routeData.push({
    num,
    title,
    exactPath,
    pageFile,
    exists,
    startLine,
    endLine,
    actualLines
  });
}

console.log(`Parsed ${routeData.length} routes from Section 3.`);

routeData.forEach(r => {
  const lineStatus = r.endLine ? `(Cited: 1-${r.endLine}, Actual: ${r.actualLines})` : `(Actual lines: ${r.actualLines})`;
  const lineWarning = r.endLine && Math.abs(r.endLine - r.actualLines) > 10 ? ' [LINE DISCREPANCY]' : '';
  console.log(`Route #${String(r.num).padStart(2, '0')}: ${r.exactPath?.padEnd(25)} -> ${r.pageFile} ${lineStatus}${lineWarning}`);
});

const missingRoutes = routeData.filter(r => !r.exists);
console.log(`\nMissing / Hallucinated Routes: ${missingRoutes.length}`);
if (missingRoutes.length > 0) {
  console.log(missingRoutes);
} else {
  console.log('All 34 routes physically exist on disk at src/app/**/page.tsx.');
}
