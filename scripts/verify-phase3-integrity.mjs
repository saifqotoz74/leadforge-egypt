import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const projectRoot = 'E:/Antigravity Projects/Leads';
const manifestPath = 'E:/Antigravity Backups/manifest_pre_phase3_20261019.txt';

const manifestLines = fs.readFileSync(manifestPath, 'utf-8').trim().split('\n');
const baseline = new Map();
for (const line of manifestLines) {
  const parts = line.trim().split('  ');
  if (parts.length >= 2) {
    const hash = parts[0].trim();
    const rel = parts.slice(1).join('  ').trim().replace(/\\/g, '/');
    baseline.set(rel, hash);
  }
}

function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
    if (
      rel === '.git' ||
      rel.startsWith('.git/') ||
      rel.startsWith('node_modules/') ||
      rel.startsWith('.next/') ||
      rel.startsWith('.pgdata/') ||
      rel.startsWith('coverage/') ||
      rel.startsWith('.gemini/')
    ) {
      continue;
    }
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getFiles(filePath, fileList);
    } else {
      fileList.push(rel);
    }
  }
  return fileList;
}

const currentFiles = getFiles(projectRoot);
const currentMap = new Map();

for (const rel of currentFiles) {
  const full = path.join(projectRoot, rel);
  const data = fs.readFileSync(full);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  currentMap.set(rel, hash);
}

const modified = [];
const added = [];
const deleted = [];

for (const [rel, baseHash] of baseline.entries()) {
  if (!currentMap.has(rel)) {
    deleted.push(rel);
  } else if (currentMap.get(rel) !== baseHash) {
    modified.push({ file: rel, baseHash, curHash: currentMap.get(rel) });
  }
}

for (const [rel, curHash] of currentMap.entries()) {
  if (!baseline.has(rel)) {
    added.push({ file: rel, curHash });
  }
}

console.log('=== PHASE 3 INTEGRITY VERIFICATION REPORT ===');
console.log(`Baseline tracked files: ${baseline.size}`);
console.log(`Current tracked files:  ${currentMap.size}`);
console.log(`\nMODIFIED FILES (${modified.length}):`);
modified.forEach((m) => console.log(`  [MODIFIED] ${m.file}`));
console.log(`\nADDED FILES (${added.length}):`);
added.forEach((a) => console.log(`  [ADDED]    ${a.file}`));
console.log(`\nDELETED FILES (${deleted.length}):`);
deleted.forEach((d) => console.log(`  [DELETED]  ${d}`));
