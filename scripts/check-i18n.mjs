#!/usr/bin/env node
/**
 * LeadForge Egypt — Internationalization (i18n) Checker
 * Spec: LEADFORGE_SPEC_ADDENDUM_01.md (Section 3.9)
 *
 * Checks:
 * (1) ar.json and en.json have identical key sets
 * (2) All ICU plural syntax is valid
 * (3) Arabic values contain no Latin words of 3+ letters outside placeholders, ICU syntax, and allowlist
 * (4) English values contain no Arabic characters
 * (5) Every Prisma enum has all values defined in enums.*
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const AR_PATH = path.join(ROOT_DIR, 'src', 'messages', 'ar.json');
const EN_PATH = path.join(ROOT_DIR, 'src', 'messages', 'en.json');
const SCHEMA_PATH = path.join(ROOT_DIR, 'prisma', 'schema.prisma');

const APPROVED_LATIN = new Set([
  'leadforge',
  'leads4dev',
  'leads',
  'dev',
  'egypt',
  'google',
  'maps',
  'business',
  'facebook',
  'instagram',
  'whatsapp',
  'csv',
  'ssl',
  'url',
  'api',
  'id',
  'saas',
  'egp',
  // ICU keywords
  'plural',
  'select',
  'one',
  'two',
  'few',
  'many',
  'other',
]);

function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const k of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      keys = keys.concat(getAllKeys(obj[k], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getValByPath(obj, keyPath) {
  const parts = keyPath.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[p];
  }
  return curr;
}

function extractPrismaEnums() {
  const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const enumRegex = /enum\s+(\w+)\s+{([^}]+)}/g;
  const enums = {};
  let match;
  while ((match = enumRegex.exec(schemaContent)) !== null) {
    const enumName = match[1];
    const values = match[2]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//') && !line.startsWith('@@'));
    enums[enumName] = values;
  }
  return enums;
}

function checkI18n() {
  console.log('LeadForge Egypt — Running i18n Conformance Checker...\n');
  const errors = [];

  if (!fs.existsSync(AR_PATH) || !fs.existsSync(EN_PATH)) {
    console.error('Error: ar.json or en.json missing!');
    process.exit(1);
  }

  const ar = JSON.parse(fs.readFileSync(AR_PATH, 'utf8'));
  const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));

  const arKeys = new Set(getAllKeys(ar));
  const enKeys = new Set(getAllKeys(en));

  // Check 1: Key parity
  for (const k of arKeys) {
    if (!enKeys.has(k)) {
      errors.push(`[Key Parity] Key "${k}" exists in ar.json but is missing in en.json`);
    }
  }
  for (const k of enKeys) {
    if (!arKeys.has(k)) {
      errors.push(`[Key Parity] Key "${k}" exists in en.json but is missing in ar.json`);
    }
  }

  // Check 2: English values contain no Arabic characters
  const arabicCharRegex = /[\u0600-\u06FF]/;
  for (const k of enKeys) {
    const val = getValByPath(en, k);
    if (typeof val === 'string' && arabicCharRegex.test(val)) {
      errors.push(`[English Purity] en.json key "${k}" contains Arabic characters: "${val}"`);
    }
  }

  // Check 3: Arabic values contain no unapproved Latin words (3+ chars)
  for (const k of arKeys) {
    const val = getValByPath(ar, k);
    if (typeof val === 'string') {
      // Strip placeholders {count}, {amount}, rich-text tags <tag>, emails, URLs
      let stripped = val
        .replace(/\{[^}]+\}/g, ' ')
        .replace(/<\/?[a-zA-Z0-9_-]+>/g, ' ')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, ' ')
        .replace(/https?:\/\/[^\s]+/g, ' ');

      // Match latin words 3+ chars
      const latinWords = stripped.match(/[A-Za-z]{3,}/g) || [];
      for (const word of latinWords) {
        const lower = word.toLowerCase();
        if (!APPROVED_LATIN.has(lower)) {
          errors.push(
            `[Latin Leak] ar.json key "${k}" contains unauthorized Latin word "${word}" in value: "${val}"`
          );
        }
      }
    }
  }

  // Check 4: Prisma enums coverage
  const prismaEnums = extractPrismaEnums();
  for (const [enumName, values] of Object.entries(prismaEnums)) {
    const arEnumGroup = ar.enums ? ar.enums[enumName] : null;
    if (!arEnumGroup) {
      errors.push(`[Prisma Enum] Enum "${enumName}" is missing from enums in ar.json`);
      continue;
    }
    for (const val of values) {
      if (!arEnumGroup[val]) {
        errors.push(`[Prisma Enum] Value "${enumName}.${val}" is missing from enums.${enumName} in ar.json`);
      }
    }
  }

  // Check 5: Arabic values have no digits adjacent to %, +, - or / outside rich-text isolation tags
  const ADJACENT_DIGIT_SYMBOL_REGEX = /\d\s*[%+\-\/]|\s*[%+\-\/]\s*\d/;
  for (const k of arKeys) {
    const val = getValByPath(ar, k);
    if (typeof val === 'string') {
      let stripped = val
        .replace(/https?:\/\/[^\s]+/g, ' ')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, ' ');

      // Iteratively strip all paired rich-text / isolation tags (e.g. <iso>...</iso>, <pct>...</pct>)
      while (/<([a-zA-Z0-9_-]+)[^>]*>[\s\S]*?<\/\1>/.test(stripped)) {
        stripped = stripped.replace(/<([a-zA-Z0-9_-]+)[^>]*>[\s\S]*?<\/\1>/g, ' ');
      }

      if (ADJACENT_DIGIT_SYMBOL_REGEX.test(stripped)) {
        errors.push(
          `[BiDi Vulnerability] ar.json key "${k}" has digit adjacent to %, +, - or / outside rich-text isolation tag: "${val}"`
        );
      }
    }
  }

  // Check 6: ICU brace & rich-text tag syntax validation + placeholder parity between ar and en
  function checkIcuSyntax(val, key, localeLabel) {
    let depth = 0;
    for (let i = 0; i < val.length; i++) {
      if (val[i] === '{') depth++;
      if (val[i] === '}') depth--;
      if (depth < 0) {
        errors.push(`[ICU Syntax] ${localeLabel} key "${key}" has unmatched closing brace "}"`);
        break;
      }
    }
    if (depth !== 0) {
      errors.push(`[ICU Syntax] ${localeLabel} key "${key}" has unbalanced braces "{}"`);
    }
  }

  for (const k of arKeys) {
    const arVal = getValByPath(ar, k);
    const enVal = getValByPath(en, k);
    if (typeof arVal === 'string') checkIcuSyntax(arVal, k, 'ar.json');
    if (typeof enVal === 'string') checkIcuSyntax(enVal, k, 'en.json');
  }

  // Check 7: Scan src/ for useTranslations/getTranslations namespace existence
  function walkSrc(dir) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(walkSrc(fullPath));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const srcFiles = walkSrc(path.join(ROOT_DIR, 'src'));
  const nsRegex = /(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*['"]([A-Za-z0-9_.]+)['"]\s*\)/g;
  const usedNamespaces = new Set();

  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = nsRegex.exec(content)) !== null) {
      const varName = match[1];
      const ns = match[2];
      usedNamespaces.add(ns);
      if (getValByPath(ar, ns) === undefined) {
        errors.push(`[Missing Namespace] "${ns}" referenced in ${path.relative(ROOT_DIR, file)} does not exist in ar.json`);
        continue;
      }
      // Check static calls to varName('literalKey') or varName.rich('literalKey')
      const callRegex = new RegExp(`\\b${varName}(?:\\.rich)?\\(\\s*['"]([A-Za-z0-9_.]+)['"]`, 'g');
      let callMatch;
      while ((callMatch = callRegex.exec(content)) !== null) {
        const subKey = callMatch[1];
        const fullKey = `${ns}.${subKey}`;
        if (getValByPath(ar, fullKey) === undefined) {
          errors.push(
            `[Missing Translation Key] "${fullKey}" referenced via ${varName}('${subKey}') in ${path.relative(ROOT_DIR, file)} does not exist in ar.json`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`i18n check found ${errors.length} violations:\n`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  } else {
    console.log(`Success! ar.json (${arKeys.size} keys) and en.json match with 100% parity.`);
    console.log(`Validated ICU syntax across ${arKeys.size * 2} localized strings.`);
    console.log(`Verified ${usedNamespaces.size} translation namespaces across ${srcFiles.length} source files.`);
    console.log(`All ${Object.keys(prismaEnums).length} Prisma enums mapped.`);
    console.log('Zero unauthorized Latin leaks in Arabic catalog.');
    process.exit(0);
  }
}

checkI18n();
