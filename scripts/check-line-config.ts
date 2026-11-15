// Prints pass/fail for the LINE configuration. It never prints a configured value.
// Usage: npm run check:line-config   (reads the current environment, for example from .env.local)
import { checkLineConfig } from '../src/lib/liff/config';

const result = checkLineConfig(process.env);
for (const c of result.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `  - ${c.hint}`}`);
console.log(result.ok ? '\nLINE configuration looks consistent.' : '\nLINE configuration has problems.');
process.exit(result.ok ? 0 : 1);
