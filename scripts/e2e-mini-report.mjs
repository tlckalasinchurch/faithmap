// Browser check of the MINI App weekly report form against a dev server with local demo data.
//   NEXT_PUBLIC_FAITHMAP_MOCK_LIFF=true FAITHMAP_DEMO_MODE=true npx next dev -p 3100
// Usage: node scripts/e2e-mini-report.mjs <outDir>
// This is a LOCAL browser test with the demo accounts. It is not a LINE test and not a production test.
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
      if (parseFloat(getComputedStyle(el).fontSize) < 16) out.smallText.push(`${getComputedStyle(el).fontSize} "${n.textContent.trim().slice(0, 20)}"`);
    }
    return out;
  });
  check(`${label}: no horizontal scroll`, !r.hScroll);
  check(`${label}: all tap targets >= 48px`, r.smallTargets.length === 0, r.smallTargets.slice(0, 3).join('; '));
  check(`${label}: all text >= 16px`, r.smallText.length === 0, r.smallText.slice(0, 3).join('; '));
}

async function signIn(page, username) {
  await page.goto(`${BASE}/mini`);
  await page.getByRole('button', { name: 'เข้าสู่ระบบด้วยรหัสผ่าน' }).click({ timeout: 60000 });
  await page.getByLabel('ชื่อผู้ใช้').fill(username);
  await page.getByLabel('รหัสผ่าน').fill('FaithMap2026!');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).waitFor({ timeout: 30000 });
}
async function openReport(page, groupName) {
  if (!(await page.getByRole('heading', { name: 'รายงานประจำสัปดาห์' }).isVisible())) await openReports(page);
  await page.locator('li', { hasText: groupName }).getByRole('button', { name: /เปิด|เริ่มรายงาน/ }).click();
  await page.getByRole('button', { name: '← กลับรายการรายงาน' }).waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes('กำลังโหลด'));
}
async function openReports(page) {
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: /รายงาน/ }).click();
  await page.getByRole('heading', { name: 'รายงานประจำสัปดาห์' }).waitFor();
}

const G = { nongkung: 'กลุ่มพันธกิจบ้านหนองกุง', nonthan: 'กลุ่มพันธกิจบ้านโนนทัน', huaisithon: 'กลุ่มพันธกิจบ้านห้วยสีทน', bueng: 'กลุ่มพันธกิจบ้านบึงวิชัย' };
const browser = await chromium.launch();
const ctxFor = (w = 360, h = 740) => browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const alertText = (page) => page.locator('main').getByRole('alert').innerText();
try {
  // A. Approved report: read-only at three widths.
  for (const [w, h] of [[360, 740], [768, 1024], [1280, 800]]) {
    const ctx = await ctxFor(w, h); const page = await ctx.newPage(); const tag = `${w}px`;
    await signIn(page, 'arunee_nongkung');
    await openReports(page);
    await audit(page, `${tag} report list`);
    await openReport(page, G.nongkung);
    await audit(page, `${tag} approved report`);
    check(`${tag}: approved report shows the approved status`, await page.getByText('อนุมัติแล้ว').first().isVisible());
    check(`${tag}: approved report has no save, submit, review or approve button`, (await page.getByRole('button', { name: /บันทึกฉบับร่าง|ส่งรายงาน|อนุมัติรายงาน|ส่งกลับให้แก้ไข|ส่งต่อ/ }).count()) === 0);
    if (w === 360) await page.screenshot({ path: `${OUT}/mini-report-approved-360.png`, fullPage: true });
    await ctx.close();
  }

  // B. Body leader writes the draft of the group he leads, saves, reloads, submits with two taps.
  {
    const ctx = await ctxFor(); const page = await ctx.newPage();
    await signIn(page, 'somchai_body_n');
    await openReport(page, G.bueng);
    await audit(page, '360px draft form');
    await page.screenshot({ path: `${OUT}/mini-report-form-360.png`, fullPage: true });
    let posts = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/v1/reports')) posts++; });
    await page.getByLabel('ผู้เยี่ยมใหม่ (คน)').fill('abc');
    await page.getByRole('button', { name: 'บันทึกฉบับร่าง' }).click();
    check('invalid count is refused on screen with a Thai message', /ตัวเลข/.test(await alertText(page)), (await alertText(page)).slice(0, 50));
    check('no request was sent for the invalid form', posts === 0);
    await page.getByLabel('ผู้เยี่ยมใหม่ (คน)').fill('1');
    for (const g of await page.getByRole('group', { name: /สถานะของ/ }).all()) await g.getByRole('button', { name: 'มา', exact: true }).click();
    await page.getByLabel('สรุปการประชุม').fill('นมัสการและแบ่งปันพระวจนะ ทดสอบเบราว์เซอร์');
    await page.getByRole('button', { name: 'บันทึกฉบับร่าง' }).click();
    await page.getByText('บันทึกฉบับร่างแล้ว (ยังไม่ได้ส่ง)').waitFor({ timeout: 20000 });
    check('draft saved and the screen says it is not sent', true);
    await page.reload();
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).waitFor({ timeout: 30000 });
    await openReport(page, G.bueng);
    check('draft text is back after reload', (await page.getByLabel('สรุปการประชุม').inputValue()).includes('ทดสอบเบราว์เซอร์'));
    check('status is still draft after save (CD-01)', await page.getByText('ฉบับร่าง (ยังไม่ส่ง)').first().isVisible());
    await page.getByRole('button', { name: 'ส่งรายงาน', exact: true }).click();
    check('submit asks for a second confirmation', await page.getByRole('button', { name: 'ยืนยันส่งรายงาน' }).isVisible());
    await page.getByRole('button', { name: 'ยืนยันส่งรายงาน' }).click();
    await page.getByText('ส่งรายงานแล้ว', { exact: true }).waitFor({ timeout: 20000 });
    check('submitted: the form is read-only now', (await page.getByLabel('สรุปการประชุม').isDisabled()) && (await page.getByRole('button', { name: 'ส่งรายงาน', exact: true }).count()) === 0);
    check('the body leader cannot approve the report he submitted (DEC-05)', (await page.getByRole('button', { name: 'อนุมัติรายงาน' }).count()) === 0);
    await page.screenshot({ path: `${OUT}/mini-report-submitted-360.png`, fullPage: true });
    await ctx.close();
  }

  // C. Report with a supervisor: the leader is read-only, the supervisor reviews first, then the body leader approves.
  {
    let ctx = await ctxFor(); let page = await ctx.newPage();
    await signIn(page, 'wichai_nonthan');
    await openReport(page, G.nonthan);
    check('leader of a submitted report cannot edit or review', (await page.getByRole('button', { name: /บันทึกฉบับร่าง|ส่งรายงาน|อนุมัติรายงาน|ส่งต่อ/ }).count()) === 0);
    await ctx.close();

    ctx = await ctxFor(); page = await ctx.newPage();
    await signIn(page, 'somchai_body_n');
    await openReport(page, G.nonthan);
    check('body leader cannot approve before the supervisor reviewed (DEC-04)', (await page.getByRole('button', { name: 'อนุมัติรายงาน' }).count()) === 0);
    await ctx.close();

    ctx = await ctxFor(); page = await ctx.newPage();
    await signIn(page, 'prapasri_care');
    await openReport(page, G.nonthan);
    await audit(page, '360px review panel');
    await page.screenshot({ path: `${OUT}/mini-report-review-360.png`, fullPage: true });
    check('supervisor sees forward, and does not see approve', (await page.getByRole('button', { name: /ส่งต่อหัวหน้าบอดี้/ }).count()) === 1 && (await page.getByRole('button', { name: 'อนุมัติรายงาน' }).count()) === 0);
    await page.getByRole('button', { name: /ส่งต่อหัวหน้าบอดี้/ }).click();
    await page.getByText('ส่งต่อให้หัวหน้าบอดี้แล้ว').waitFor({ timeout: 20000 });
    check('supervisor forwarded the report', true);
    await ctx.close();

    ctx = await ctxFor(); page = await ctx.newPage();
    await signIn(page, 'somchai_body_n');
    await openReport(page, G.nonthan);
    check('after review the body leader can approve', (await page.getByRole('button', { name: 'อนุมัติรายงาน' }).count()) === 1);
    await page.getByRole('button', { name: 'อนุมัติรายงาน' }).click();
    await page.getByText('อนุมัติรายงานแล้ว').waitFor({ timeout: 20000 });
    check('body leader approved the report', true);
    check('no action buttons remain after approval', (await page.getByRole('button', { name: /อนุมัติรายงาน|ส่งกลับให้แก้ไข|ส่งต่อ/ }).count()) === 0);
    await ctx.close();
  }

  // D. Revision required: leader edits and resubmits. A reviewer must give a reason to send back.
  {
    let ctx = await ctxFor(); let page = await ctx.newPage();
    await signIn(page, 'malee_huaisithon');
    await openReport(page, G.huaisithon);
    check('leader sees why the report was sent back', await page.getByText(/ส่งกลับให้แก้ไข เหตุผล:/).isVisible());
    check('a returned report is editable', await page.getByRole('button', { name: 'ส่งรายงาน', exact: true }).isVisible());
    await page.getByLabel('เรื่องขอบคุณและอธิษฐาน').fill('อธิษฐานเพื่อครอบครัวสมาชิก');
    await page.getByRole('button', { name: 'ส่งรายงาน', exact: true }).click();
    check('submit is blocked while members are not marked', /ยังไม่ได้เช็คชื่อ/.test(await alertText(page)), (await alertText(page)).slice(0, 50));
    for (const g of await page.getByRole('group', { name: /สถานะของ/ }).all()) await g.getByRole('button', { name: 'มา', exact: true }).click();
    await page.getByRole('button', { name: 'ส่งรายงาน', exact: true }).click();
    await page.getByRole('button', { name: 'ยืนยันส่งรายงาน' }).click();
    await page.getByText('ส่งรายงานแล้ว', { exact: true }).waitFor({ timeout: 20000 });
    check('leader resubmitted after the revision', true);
    await ctx.close();

    ctx = await ctxFor(); page = await ctx.newPage();
    await signIn(page, 'narong_coord');
    await openReport(page, G.huaisithon);
    await page.getByRole('button', { name: 'ส่งกลับให้แก้ไข' }).click();
    check('send-back without a reason is refused on screen', /เหตุผล/.test(await alertText(page)));
    await page.getByLabel(/หมายเหตุ/).fill('กรุณาเพิ่มจำนวนผู้เยี่ยม');
    await page.getByRole('button', { name: 'ส่งกลับให้แก้ไข' }).click();
    await page.getByText('ส่งกลับให้แก้ไขแล้ว').waitFor({ timeout: 20000 });
    check('supervisor sent the report back with a reason', true);
    await ctx.close();
  }

  // E. A user with no role sees no report actions.
  {
    const ctx = await ctxFor(); const page = await ctx.newPage();
    await signIn(page, 'kanya_standby');
    check('a user with no role has no reports menu', (await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: /รายงาน/ }).count()) === 0);
    await ctx.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(`${OUT}/e2e-mini-report-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
