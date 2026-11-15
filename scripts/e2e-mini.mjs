// Browser check for the MINI App at three widths. Run against a dev server started with:
//   NEXT_PUBLIC_FAITHMAP_MOCK_LIFF=true FAITHMAP_DEMO_MODE=true npx next dev -p 3100
// Usage: node scripts/e2e-mini.mjs <outDir>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import fs from 'node:fs';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3100';
const OUT = process.argv[2] ?? '.';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

async function audit(page, label) {
  const r = await page.evaluate(() => {
    const out = { hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, smallTargets: [], smallText: [] };
    const vis = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    for (const el of document.querySelectorAll('button, a[href], input, textarea, select')) {
      if (!vis(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.height < 47.5 || b.width < 47.5) out.smallTargets.push(`${el.tagName}:${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)} ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement; if (!el || !vis(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) out.smallText.push(`${fs}px "${n.textContent.trim().slice(0, 20)}"`);
    }
    return out;
  });
  check(`${label}: no horizontal scroll`, !r.hScroll);
  check(`${label}: all tap targets >= 48px`, r.smallTargets.length === 0, r.smallTargets.slice(0, 3).join('; '));
  check(`${label}: all text >= 16px`, r.smallText.length === 0, r.smallText.slice(0, 3).join('; '));
}

const browser = await chromium.launch();
try {
  for (const [w, h] of [[360, 740], [768, 1024], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const tag = `${w}px`;

    await page.goto(`${BASE}/mini`);
    await page.getByRole('heading', { name: 'ยินดีต้อนรับสู่ FaithMap' }).waitFor({ timeout: 60000 });
    check(`${tag}: sign-in screen shows`, true);
    check(`${tag}: mock banner is visible (not real LINE)`, await page.getByText('โหมดทดสอบ ไม่ใช่ LINE จริง').isVisible());
    await audit(page, `${tag} sign-in`);
    await page.screenshot({ path: `${OUT}/mini-signin-${w}.png` });

    // Mock LINE button must NOT sign in. The server refuses the mock token.
    await page.getByRole('button', { name: 'เข้าสู่ระบบด้วย LINE' }).click();
    const alert = page.locator('main').getByRole('alert'); // not Next.js's own empty route announcer
    await alert.waitFor({ timeout: 20000 });
    check(`${tag}: mock LINE sign-in is refused by the server`, /LINE/.test(await alert.innerText()), (await alert.innerText()).slice(0, 60));
    check(`${tag}: still on sign-in after the mock attempt`, await page.getByRole('heading', { name: 'ยินดีต้อนรับสู่ FaithMap' }).isVisible());

    // Keyboard focus is visible.
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${s.outlineStyle} ${s.outlineWidth}`; });
    check(`${tag}: focus indicator is visible`, /solid|auto/.test(outline) && !/ 0px/.test(outline), outline);

    // Password sign-in (local demo account) and each screen.
    await page.getByRole('button', { name: 'เข้าสู่ระบบด้วยรหัสผ่าน' }).click();
    await page.getByLabel('ชื่อผู้ใช้').fill('admin_kanok');
    await page.getByLabel('รหัสผ่าน').fill('FaithMap2026!');
    await audit(page, `${tag} password form`);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).waitFor({ timeout: 30000 });
    check(`${tag}: password sign-in reaches the home menu`, true);
    await audit(page, `${tag} home`);
    await page.screenshot({ path: `${OUT}/mini-home-${w}.png` });

    for (const label of ['รายงาน', 'กลุ่มของฉัน', 'การเติบโต', 'แจ้งเตือน']) {
      await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: new RegExp(label) }).click();
      await page.getByRole('button', { name: '← กลับหน้าแรก' }).waitFor();
      await audit(page, `${tag} ${label}`);
      if (w === 360) await page.screenshot({ path: `${OUT}/mini-${label}-${w}.png` });
      await page.getByRole('button', { name: '← กลับหน้าแรก' }).click();
    }
    // admin (not super_admin) must not see the approvals page.
    check(`${tag}: admin has no approvals tile`, (await page.getByRole('button', { name: /อนุมัติสมาชิก/ }).count()) === 0);
    await ctx.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(`${OUT}/e2e-mini-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
