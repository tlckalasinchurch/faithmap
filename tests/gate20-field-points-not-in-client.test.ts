/**
 * DEC-06, DEC-17: the team field point list holds real coordinator names and phone numbers.
 * It must stay on the server. Before this fix the map screen imported it, so every browser file held the numbers.
 * The build check (`npm run check:bundle`) scans the real browser files. This test guards the source.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

describe('field point source list stays on the server', () => {
  const all = files(path.join(process.cwd(), 'src'));

  it('only server modules import the value list; client code may import the type only', () => {
    const offenders: string[] = [];
    for (const f of all) {
      const text = readFileSync(f, 'utf8');
      const isClient = /^\s*['"]use client['"]/m.test(text) || f.includes(`${path.sep}components${path.sep}`);
      const valueImport = /import\s*\{[^}]*KALASIN_TEAM_G_POINTS[^}]*\}\s*from\s*['"]@\/lib\/kalasin-field-points['"]/.test(text);
      if (isClient && valueImport) offenders.push(path.relative(process.cwd(), f));
    }
    expect(offenders).toEqual([]);
  });

  it('the value list is imported only by the two server services', () => {
    const importers = all
      .filter((f) => /import\s*\{[^}]*KALASIN_TEAM_G_POINTS/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(process.cwd(), f))
      .sort();
    expect(importers).toEqual(['src/server/modules/ingestion/service.ts', 'src/server/modules/team-field-points/service.ts']);
  });
});
