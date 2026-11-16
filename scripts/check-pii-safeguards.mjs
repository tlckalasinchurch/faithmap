// Prohibits accidental reintroduction of real coordinator names and phone numbers (G-19, DEC-06).
// Strategy: Strict Structural Synthetic Validation + Optional Salted HMAC via CI Secrets.
// ZERO plaintext personal data and ZERO crackable unsalted hashes are stored in repository files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

let violations = 0;

// 1. Structural Validation of src/lib/kalasin-field-points.ts
const fieldPointsPath = path.join('src', 'lib', 'kalasin-field-points.ts');
if (!fs.existsSync(fieldPointsPath)) {
  console.error(`check-pii-safeguards: Missing required file: ${fieldPointsPath}`);
  process.exit(1);
}

const fieldPointsContent = fs.readFileSync(fieldPointsPath, 'utf8');

// Match coordinator fields
const coordinatorMatches = [...fieldPointsContent.matchAll(/coordinator:\s*'([^']+)'/g)];
const phoneMatches = [...fieldPointsContent.matchAll(/phone:\s*'([^']+)'/g)];

if (coordinatorMatches.length !== 23) {
  console.error(`check-pii-safeguards: Expected exactly 23 coordinator definitions in ${fieldPointsPath}, found ${coordinatorMatches.length}`);
  violations++;
}

if (phoneMatches.length !== 23) {
  console.error(`check-pii-safeguards: Expected exactly 23 phone definitions in ${fieldPointsPath}, found ${phoneMatches.length}`);
  violations++;
}

const SYNTHETIC_COORDINATOR_RE = /^ผู้ประสานงาน จุดที่ (?:[1-9]|1\d|2[0-3])$/;
const SYNTHETIC_PHONE_RE = /^080-000-00(?:0[1-9]|1\d|2[0-3])$/;

for (const match of coordinatorMatches) {
  const value = match[1];
  if (!SYNTHETIC_COORDINATOR_RE.test(value)) {
    console.error(`check-pii-safeguards: Non-synthetic coordinator value detected in ${fieldPointsPath} (must follow 'ผู้ประสานงาน จุดที่ X')`);
    violations++;
  }
}

for (const match of phoneMatches) {
  const value = match[1];
  if (!SYNTHETIC_PHONE_RE.test(value)) {
    console.error(`check-pii-safeguards: Non-synthetic phone value detected in ${fieldPointsPath} (must follow '080-000-XXXX')`);
    violations++;
  }
}

// 2. Tracked Files Integrity Scan
let trackedFiles = [];
try {
  trackedFiles = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch (e) {
  console.error('check-pii-safeguards: git ls-files failed:', e.message);
  process.exit(2);
}

// 3. Optional Keyed HMAC Verification (from CI environment secret, zero hashes stored in git)
const hmacKey = process.env.PII_HMAC_KEY;
const prohibitedHmacsEnv = process.env.PII_PROHIBITED_HMACS;
let prohibitedHmacSet = new Set();
if (hmacKey && prohibitedHmacsEnv) {
  prohibitedHmacSet = new Set(prohibitedHmacsEnv.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
}

let scannedFiles = 0;
for (const file of trackedFiles) {
  if (!fs.existsSync(file)) continue;
  const stat = fs.statSync(file);
  if (stat.isDirectory()) continue;
  scannedFiles++;

  if (prohibitedHmacSet.size > 0 && hmacKey) {
    const content = fs.readFileSync(file, 'utf8');
    const phoneCandidates = content.match(/0\d{1,2}-?\d{3,4}-?\d{4}/g) || [];
    for (const p of phoneCandidates) {
      const h = crypto.createHmac('sha256', hmacKey).update(p.trim()).digest('hex');
      if (prohibitedHmacSet.has(h)) {
        console.error(`check-pii-safeguards: Prohibited phone HMAC matched in ${file}`);
        violations++;
      }
    }
    const thaiCandidates = content.match(/[\u0E01-\u0E5B]+(?:\s+[\u0E01-\u0E5B]+)?/g) || [];
    for (const t of thaiCandidates) {
      const trimmed = t.trim();
      if (trimmed.length < 4) continue;
      const h = crypto.createHmac('sha256', hmacKey).update(trimmed).digest('hex');
      if (prohibitedHmacSet.has(h)) {
        console.error(`check-pii-safeguards: Prohibited coordinator name HMAC matched in ${file}`);
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`check-pii-safeguards: FAILED with ${violations} violation(s).`);
  process.exit(1);
}

const hmacMsg = prohibitedHmacSet.size > 0
  ? `with ${prohibitedHmacSet.size} salted HMAC checks from CI`
  : '(CI HMAC secret not set; structural synthetic validation active)';

console.log(`check-pii-safeguards: PASSED. Scanned ${scannedFiles} tracked files; 23 Team G points structurally verified ${hmacMsg}.`);
process.exit(0);
