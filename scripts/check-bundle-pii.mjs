// Fails when a phone number or coordinator name of a team field point is found in the browser files of the build.
// DEC-06, DEC-17: that data may only leave the server through /api/v1/team-field-points after an authorization check.
// Run after `npm run build`. It reads the source list and scans .next/static. It prints counts only, never the values.
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync('src/lib/kalasin-field-points.ts', 'utf8');
const phones = [...source.matchAll(/phone:\s*'([^']+)'/g)].map((m) => m[1]);
const names = [...source.matchAll(/coordinator:\s*'([^']+)'/g)].map((m) => m[1]);
if (phones.length === 0 || names.length === 0) {
  console.error('check-bundle-pii: the source list has no phone or coordinator entries. The check cannot run.');
  process.exit(2);
}
const needles = [...new Set([...phones, ...names])];
const root = path.join('.next', 'static');
if (!fs.existsSync(root)) {
  console.error('check-bundle-pii: .next/static not found. Run the build first.');
  process.exit(2);
}
let files = 0;
let hits = 0;
const walk = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html|json|txt|map)$/.test(f)) {
      files += 1;
      const text = fs.readFileSync(p, 'utf8');
      for (const n of needles) if (text.includes(n)) hits += 1;
    }
  }
};
walk(root);
console.log(`check-bundle-pii: scanned ${files} browser files for ${needles.length} values: ${hits} hit(s)`);
process.exit(hits === 0 ? 0 : 1);
