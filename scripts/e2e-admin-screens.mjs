// The map attribution text of the map library is excluded: its licence requires it to stay visible as it is.
// Browser check of the admin screens added in the completion round, at three widths.
// Run against a dev server started with a scratch database:
//   FAITHMAP_DEMO_MODE=true DATABASE_URL=pglite://<scratch dir> npx next dev -p 3100
// Usage: node scripts/e2e-admin-screens.mjs <outDir>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import fs from 'node:fs';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3100';
const OUT = process.argv[2] ?? '.';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

async function audit(page, label) {
  const r = await page.evaluate(() => {
    const vis = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const main = document.querySelector('main');
    const small = [];
    for (const el of main.querySelectorAll('button, a[href], input:not([type=checkbox]), select, textarea')) {
      if (!vis(el) || el.closest('.maplibregl-ctrl-attrib')) continue;
      const b = el.getBoundingClientRect();
      if (b.height < 47.5) small.push(`${el.tagName}:${(el.textContent || '').trim().slice(0, 16)} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    const tiny = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT); let n;
    while ((n = walker.nextNode())) { if (!n.textContent.trim()) continue; const el = n.parentElement; if (!el || !vis(el) || el.closest('.maplibregl-ctrl-attrib')) continue; if (parseFloat(getComputedStyle(el).fontSize) < 16) tiny.push(`${parseFloat(getComputedStyle(el).fontSize)}px "${n.textContent.trim().slice(0, 16)}"`); }
    return { hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, small, tiny };
  });
  check(`${label}: no horizontal scroll`, !r.hScroll);
  check(`${label}: controls >= 48px high`, r.small.length === 0, r.small.slice(0, 3).join('; '));
  check(`${label}: text >= 16px`, r.tiny.length === 0, r.tiny.slice(0, 3).join('; '));
}

const browser = await chromium.launch();
try {
  for (const [w, h] of [[360, 740], [768, 1024], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();

    // 1. Body management (FR-01.2)
    await page.goto(`${BASE}/?tab=governance`, { timeout: 120000 });
    await page.getByRole('heading', { name: 'จัดการบอดี้' }).waitFor({ timeout: 120000 });
    if (w === 360) {
      const code = `UI-${Date.now() % 1000000}`;
      await page.getByLabel('รหัสบอดี้').fill(code);
      await page.getByLabel('ชื่อบอดี้').fill('บอดี้ทดสอบหน้าจอ');
      await page.getByRole('button', { name: 'สร้างบอดี้ใหม่' }).click();
      await page.getByText('สร้างบอดี้ บอดี้ทดสอบหน้าจอ เรียบร้อย').waitFor({ timeout: 30000 });
      check('create a Body from the screen', true);
      await page.waitForTimeout(3000); // the screen reloads the workspace after a change
      await page.getByLabel('รหัสบอดี้').fill(code);
      await page.getByLabel('ชื่อบอดี้').fill('ซ้ำ');
      await page.getByRole('button', { name: 'สร้างบอดี้ใหม่' }).click();
      await page.getByText('มีรหัสบอดี้นี้อยู่แล้ว').waitFor({ timeout: 30000 });
      check('duplicate code shows a Thai message', true);
    }
    await audit(page, `${w}px governance`);
    await page.screenshot({ path: `${OUT}/governance-${w}.png` });

    // 2. Follow-ups with outcome (FR-09.2)
    await page.goto(`${BASE}/?tab=pastoral`, { timeout: 120000 });
    await page.getByText(/คิวงานเยี่ยมติดตามอภิบาล/).waitFor({ timeout: 120000 });
    const done = page.getByRole('button', { name: 'เยี่ยมสำเร็จ' }).first();
    if (await done.count()) {
      await done.click();
      const save = page.getByRole('button', { name: 'บันทึกผลและปิดรายการ' });
      await save.waitFor({ timeout: 10000 });
      check(`${w}px: closing needs an outcome (button disabled while empty)`, await save.isDisabled());
      await page.getByLabel('ผลการติดตาม (จำเป็นต้องกรอก)').fill('โทรหาแล้ว');
      check(`${w}px: button enabled after typing`, await save.isEnabled());
    } else {
      check(`${w}px: an open follow-up exists in the demo data`, false, 'no open follow-up found');
    }
    await audit(page, `${w}px pastoral`);
    await page.screenshot({ path: `${OUT}/pastoral-${w}.png` });

    // 3. Dashboard leaderless panel is shown only when a group has no active Group Leader (FR-02.4); layout check only
    await page.goto(`${BASE}/?tab=dashboard`, { timeout: 120000 });
    await page.waitForTimeout(1500);
    await audit(page, `${w}px dashboard`);
    // 4. The remaining desktop tabs: layout and text size only
    for (const tab of ['report', 'approvals', 'brief', 'map', 'ingestion', 'field-points']) {
      await page.goto(`${BASE}/?tab=${tab}`, { timeout: 120000 });
      await page.waitForTimeout(1800);
      await audit(page, `${w}px ${tab}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAIL', `(${results.filter(Boolean).length}/${results.length})`);
process.exit(results.every(Boolean) ? 0 : 1);
