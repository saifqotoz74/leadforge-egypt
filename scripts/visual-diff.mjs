#!/usr/bin/env node
/**
 * LeadForge Egypt — Visual Regression Diff Engine
 * Compares visual captures against screenshots/baseline/
 * Flags routes with > 5% pixel divergence and generates visual diff artifacts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BASELINE_DIR = path.join(ROOT_DIR, 'screenshots', 'baseline');
const CANDIDATE_DIR = path.join(ROOT_DIR, 'screenshots');
const DIFF_DIR = path.join(ROOT_DIR, 'screenshots', 'diffs');

export function comparePngBuffers(baselineBuf, candidateBuf, diffOutPath = null, threshold = 0.1) {
  const img1 = PNG.sync.read(baselineBuf);
  const img2 = PNG.sync.read(candidateBuf);

  const width = Math.max(img1.width, img2.width);
  const height = Math.max(img1.height, img2.height);

  // Normalize to matching dimensions if needed
  let buf1 = img1.data;
  let buf2 = img2.data;

  if (img1.width !== width || img1.height !== height) {
    const norm1 = new PNG({ width, height });
    PNG.bitblt(img1, norm1, 0, 0, img1.width, img1.height, 0, 0);
    buf1 = norm1.data;
  }

  if (img2.width !== width || img2.height !== height) {
    const norm2 = new PNG({ width, height });
    PNG.bitblt(img2, norm2, 0, 0, img2.width, img2.height, 0, 0);
    buf2 = norm2.data;
  }

  const diffPng = new PNG({ width, height });
  const numDiffPixels = pixelmatch(buf1, buf2, diffPng.data, width, height, {
    threshold,
    includeAA: false,
    diffColor: [255, 0, 0], // Bright red for differences
  });

  const totalPixels = width * height;
  const diffPercentage = (numDiffPixels / totalPixels) * 100;

  let hasDiffImage = false;
  if (diffPercentage > 5.0 && diffOutPath) {
    const dir = path.dirname(diffOutPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(diffOutPath, PNG.sync.write(diffPng));
    hasDiffImage = true;
  }

  return {
    width,
    height,
    totalPixels,
    numDiffPixels,
    diffPercentage: Number(diffPercentage.toFixed(2)),
    hasDiffImage,
  };
}

export function runVisualDiff(options = {}) {
  const isSelfTest = options.selfTest || process.argv.includes('--self-test');
  const customCandidateDir = options.candidateDir || (isSelfTest ? BASELINE_DIR : CANDIDATE_DIR);

  console.log(`\n================ LEADFORGE VISUAL DIFF ENGINE ================`);
  console.log(`Mode: ${isSelfTest ? 'SELF-TEST (Baseline vs Itself)' : 'REGRESSION TEST (Candidate vs Baseline)'}`);
  console.log(`Baseline Directory:  ${BASELINE_DIR}`);
  console.log(`Candidate Directory: ${customCandidateDir}\n`);

  if (!fs.existsSync(BASELINE_DIR)) {
    console.error(`Error: Baseline directory not found at: ${BASELINE_DIR}`);
    process.exit(1);
  }

  const baselineFiles = fs
    .readdirSync(BASELINE_DIR)
    .filter((f) => f.endsWith('.png'))
    .sort();

  if (baselineFiles.length === 0) {
    console.error(`Error: Zero baseline images found in ${BASELINE_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(DIFF_DIR)) {
    fs.mkdirSync(DIFF_DIR, { recursive: true });
  }

  const results = [];
  let routesOverThreshold = 0;

  for (const file of baselineFiles) {
    const baselinePath = path.join(BASELINE_DIR, file);
    const candidatePath = path.join(customCandidateDir, file);

    if (!fs.existsSync(candidatePath)) {
      results.push({
        file,
        status: 'MISSING',
        diffPct: 100,
        diffPixels: 0,
        totalPixels: 0,
        diffImage: null,
      });
      continue;
    }

    const baselineBuf = fs.readFileSync(baselinePath);
    const candidateBuf = fs.readFileSync(candidatePath);
    const diffFile = file.replace(/\.png$/, '_diff.png');
    const diffPath = path.join(DIFF_DIR, diffFile);

    const diff = comparePngBuffers(baselineBuf, candidateBuf, diffPath);

    if (diff.diffPercentage > 5.0) {
      routesOverThreshold++;
    }

    results.push({
      file,
      status: diff.diffPercentage === 0 ? 'MATCH' : diff.diffPercentage > 5 ? 'DIVERGED (>5%)' : 'DRIFT (<=5%)',
      diffPct: diff.diffPercentage,
      diffPixels: diff.numDiffPixels,
      totalPixels: diff.totalPixels,
      diffImage: diff.hasDiffImage ? diffFile : null,
    });
  }

  console.log(`| Baseline Image | Status | Diff % | Changed Pixels | Diff Artifact |`);
  console.log(`| :--- | :---: | :---: | :---: | :--- |`);

  for (const r of results) {
    const diffImgStr = r.diffImage ? `\`screenshots/diffs/${r.diffImage}\`` : 'None (<= 5%)';
    console.log(`| \`${r.file}\` | **${r.status}** | ${r.diffPct}% | ${r.diffPixels} / ${r.totalPixels} | ${diffImgStr} |`);
  }

  console.log(`\nSummary: Scanned ${results.length} files. Over 5% threshold: ${routesOverThreshold} routes.`);

  if (isSelfTest) {
    const allZero = results.every((r) => r.diffPct === 0);
    console.log(`\nSELF-TEST RESULT: baseline vs itself = ${allZero ? '0.00% (PERFECT MATCH)' : 'FAILED'}`);
    if (!allZero) process.exit(1);
  }

  return results;
}

// Direct CLI execution
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runVisualDiff();
}
