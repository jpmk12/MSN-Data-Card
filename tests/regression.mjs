// Regression suite for IPRQ-BROS-MDC.
//
// Usage:
//   1. Serve the file locally:
//        python3 -m http.server 8000
//   2. In another terminal, install playwright if needed:
//        npm i playwright
//        npx playwright install chromium
//   3. Run:
//        node tests/regression.mjs
//
// Override the URL with the BASE_URL env var if you serve on a different
// port or want to run against a downloaded copy:
//        BASE_URL=http://localhost:5000/IP_REQUAL_BROS__Mission_Check.html node tests/regression.mjs

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.BASE_URL || 'http://127.0.0.1:8000/IP_REQUAL_BROS__Mission_Check.html';
const downloadOut = path.join(__dirname, 'tmp-downloaded.html');

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', e => consoleErrors.push('PAGE: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error' && !/frame-ancestors/.test(m.text())) {
    consoleErrors.push('CONSOLE: ' + m.text());
  }
});

const results = [];
const pass = (name) => results.push({ name, status: 'PASS' });
const fail = (name, why) => results.push({ name, status: 'FAIL', why });
const eq = (name, got, want) =>
  (JSON.stringify(got) === JSON.stringify(want)
    ? pass(name)
    : fail(name, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
const ok = (name, cond, why) => (cond ? pass(name) : fail(name, why || 'condition false'));

async function freshLoad() {
  await page.goto(url + '?v=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.evaluate(() => localStorage.removeItem('iprq-bros-mdc-v1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
}
async function clickTab(label) {
  await page.evaluate(l => {
    const b = [...document.querySelectorAll('.tab-btn')].find(x => x.textContent.trim() === l);
    if (b) b.click();
  }, label);
  await page.waitForTimeout(200);
}

// ── 1. Page metadata ────────────────────────────────────────────────
await freshLoad();
eq('Title is IPRQ-BROS-MDC', await page.title(), 'IPRQ-BROS-MDC');

// ── 2. Header default values ────────────────────────────────────────
eq('Callsign default CADDO 55',  await page.$eval('#hdr-callsign', e => e.value), 'CADDO 55');
eq('Student 1 default DEAD',     await page.$eval('#hdr-student1', e => e.value), 'DEAD');
eq('Student 2 default DUFF',     await page.$eval('#hdr-student2', e => e.value), 'DUFF');

// ── 3. SOE defaults / calc ──────────────────────────────────────────
eq('Takeoff default 1400', await page.$eval('#soe-takeoff', e => e.value), '1400');
const cells = await page.$$eval('#tab-main table tr', rows =>
  rows.map(r => [...r.querySelectorAll('td')].map(t => t.textContent.trim())));
ok('SOE back-calcs from 1400', cells.some(r => r.includes('1015') && r.includes('0515')));

// ── 4. Route of Flight defaults + MOTA picker ───────────────────────
const rofDefault = 'KLTS OKKIE3.CDS LBB/360/030 AR197 LBB/322/047 LBB/106/039 IR154 PNH/123/051 DOGIN DUKE KLTS';
eq('Route of Flight default', await page.$eval('#rof-input', e => e.value), rofDefault);
await page.selectOption('#rof-preset', 'MOTA4');
await page.click('button[onclick="applyRoutePreset(\'insert\')"]');
await page.waitForTimeout(150);
eq('MOTA4 insert replaces route',
  await page.$eval('#rof-input', e => e.value),
  'OKKIE_.CDS LBB360030 AR197 LBB322047 CDS');
await page.selectOption('#rof-preset', 'MOTA7');
await page.click('button[onclick="applyRoutePreset(\'append\')"]');
await page.waitForTimeout(150);
ok('MOTA7 append adds after current',
  (await page.$eval('#rof-input', e => e.value)).endsWith(
    'ROCKN_.BFV MMB181014 AR400 HCT339101 AR400 MMB181014'));
await page.fill('#rof-input', 'MY TEST ROUTE');
await page.click('button[onclick="saveCurrentRoute()"]');
await page.waitForTimeout(150);
const customOpts = await page.$$eval('#rof-preset optgroup[label="Custom"] option', els => els.map(e => e.value));
eq('Custom save auto-names Custom 1', customOpts, ['Custom 1']);

// ── 5. Pattern Work defaults + Custom + remove ──────────────────────
let pat = await page.$$eval('#pattern-list [data-preset]', els => els.map(e => e.getAttribute('data-preset')));
eq('Pattern defaults are 4 in order', pat,
  ['DUKE TAC 6500', 'DUKE BEAM', 'DUKE ACCEL 6500', 'STR IN']);
await page.selectOption('#pattern-select', 'Custom');
await page.click('button[onclick="addPatternItem()"]');
await page.fill('#pattern-list [data-preset="Custom"] input.pattern-custom-input', 'Touch and go RWY 36');
await page.waitForTimeout(150);
await page.evaluate(() => document.querySelector('#pattern-list [data-preset="DUKE TAC 6500"] button').click());
await page.waitForTimeout(150);
pat = await page.$$eval('#pattern-list [data-preset]', els => els.map(e => e.getAttribute('data-preset')));
eq('After × on DUKE TAC 6500', pat, ['DUKE BEAM', 'DUKE ACCEL 6500', 'STR IN', 'Custom']);

// ── 6. ARCT-derived headings ────────────────────────────────────────
await page.fill('#soe-arct', '1530');
await page.waitForTimeout(150);
eq('Three Rs ARCT-30 suffix', await page.$eval('#three-rs-suffix', e => e.textContent), ': 1500');
eq('Three Cs ARCT-15 suffix', await page.$eval('#three-cs-suffix', e => e.textContent), ': 1515');

// ── 7. Slow offset ──────────────────────────────────────────────────
await page.fill('#soe-lztime', '1430');
await page.selectOption('#ll-slow-offset', '180');
await page.waitForTimeout(150);
eq('Slow = LZ 1430 − 3:00', await page.$eval('#ll-slow', e => e.textContent), '14:27:00');

// ── 8. LL Info route picker ─────────────────────────────────────────
eq('LL Info default IR-154 Entry A', await page.$eval('#ll-entry-pt', e => e.textContent), 'A');
eq('LL Info default IR-154 Exit J',  await page.$eval('#ll-exit-pt',  e => e.textContent), 'J');
await page.selectOption('#ll-route-select', 'IR-193');
await page.waitForTimeout(100);
eq('IR-193 Entry placeholder —', await page.$eval('#ll-entry-pt', e => e.textContent), '—');

// ── 9. Safety Supplements dynamic ───────────────────────────────────
const ssBase = await page.$$eval('#ss-incorporated-list input.ss-input', els => els.map(e => e.value));
eq('Incorporated has 4 defaults', ssBase, [
  'SS-325 (MGPS date anomaly)',
  'SS-324 (NLG steering actuator)',
  'OP SUP 1S-323 (Landing w/ 1–2 engines inop)',
  'SS-322 (Revised gear down/locked)',
]);
await page.click('button[onclick="addSafetyItem(\'incorporated\')"]'); // empty row, should be dropped on reload
await page.waitForTimeout(100);

// ── 10. FCIF / SII / EFB editable ───────────────────────────────────
eq('FCIF default', await page.$eval('#fcif-value', e => e.value), '26-22B - C-17 Pubs Release');
eq('SII default',  await page.$eval('#sii-value', e => e.value), 'none active');
eq('EFB Baseline', await page.$eval('#efb-baseline', e => e.value), '26-04 (23 Apr 26)');
eq('EFB iOS',      await page.$eval('#efb-ios', e => e.value), '26.5 CAO 12 May 26');
eq('EFB Pub Sync', await page.$eval('#efb-pubsync', e => e.value), '26 May 2026');
eq('EFB FLIP',     await page.$eval('#efb-flip', e => e.value), '05/14/2026 thru 06/10/2026');

// ── 11. Briefings / Notes ───────────────────────────────────────────
await page.click('button[onclick="addNote()"]');
await page.fill('#notes-list .note-input', 'Weather check\nLine 2');
await page.waitForTimeout(150);

// ── 12. Box Setup defaults ──────────────────────────────────────────
const box = await page.evaluate(() => ({
  s1: [...document.querySelectorAll('#box-step1-list input')].map(i => i.value),
  s2: [...document.querySelectorAll('#box-step2-list input')].map(i => i.value),
  s3: [...document.querySelectorAll('#box-step3-list input')].map(i => i.value),
  kp: [...document.querySelectorAll('#box-keypoints-list input')].map(i => i.value),
}));
eq('Box Step 1 defaults', box.s1, ['TAC Pts in SEC', 'Build FLT plan', 'Fix times']);
eq('Box Step 2 defaults', box.s2, ['LZ Ldg/TO Told', 'Add BULL']);
eq('Box Step 3 empty by default', box.s3, []);
eq('Key Points has 4 defaults', box.kp.length, 4);

// ── 13. AR tab checkbox ─────────────────────────────────────────────
await clickTab('AR');
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.chk-title')].find(x => x.textContent.includes('After Takeoff'));
  if (t) t.querySelector('.chk-input').click();
});
await page.waitForTimeout(150);

// ── 14. Reload — everything persists ────────────────────────────────
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(450);
eq('Persist: ARCT', await page.$eval('#soe-arct', e => e.value), '1530');
eq('Persist: LZ Time', await page.$eval('#soe-lztime', e => e.value), '1430');
eq('Persist: Slow offset', await page.$eval('#ll-slow-offset', e => e.value), '180');
const patPersist = await page.$$eval('#pattern-list [data-preset]', els => els.map(e => e.getAttribute('data-preset')));
eq('Persist: Pattern after × + Custom', patPersist, ['DUKE BEAM', 'DUKE ACCEL 6500', 'STR IN', 'Custom']);
eq('Persist: Custom row text',
  await page.$eval('#pattern-list [data-preset="Custom"] input.pattern-custom-input', e => e.value),
  'Touch and go RWY 36');
const ssAfter = await page.$$eval('#ss-incorporated-list input.ss-input', els => els.map(e => e.value));
ok('Persist: empty SS row dropped', ssAfter.length === 4 && ssAfter.every(v => v.trim()));
const notesAfter = await page.$$eval('#notes-list .note-input', els => els.map(e => e.value));
eq('Persist: note with newline', notesAfter, ['Weather check\nLine 2']);
ok('Persist: After Takeoff checkbox stays checked',
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.chk-title')].find(x => x.textContent.includes('After Takeoff'));
    return t && t.querySelector('.chk-input').checked;
  }));

// ── 15. Pattern dedupe / unknown drop ───────────────────────────────
await page.evaluate(() => {
  localStorage.setItem('iprq-bros-mdc-v1', JSON.stringify({
    pattern: ['DUKE TAC 6500', 'DUKE TAC 6500', 'NONEXISTENT', 'STR IN', 'DUKE BEAM']
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(450);
const dedup = await page.$$eval('#pattern-list [data-preset]', els => els.map(e => e.getAttribute('data-preset')));
eq('Dedupe + drop unknown', dedup, ['DUKE TAC 6500', 'STR IN', 'DUKE BEAM']);

// ── 16. Reset ───────────────────────────────────────────────────────
await page.click('button[onclick="resetCard()"]');
await page.waitForTimeout(700);
eq('Reset: Callsign default', await page.$eval('#hdr-callsign', e => e.value), 'CADDO 55');
eq('Reset: ARCT empty',       await page.$eval('#soe-arct', e => e.value), '');
const patReset = await page.$$eval('#pattern-list [data-preset]', els => els.map(e => e.getAttribute('data-preset')));
eq('Reset: Pattern 4 defaults', patReset, ['DUKE TAC 6500', 'DUKE BEAM', 'DUKE ACCEL 6500', 'STR IN']);
eq('Reset: Slow offset default', await page.$eval('#ll-slow-offset', e => e.value), '100');

// ── 17. Route Data SVGs + dynamic titles ────────────────────────────
await clickTab('Low Level');
eq('Route Data default IR-154', await page.$eval('#route-select', e => e.value), 'IR-154');
ok('IR-154 SVG present', await page.evaluate(() => document.querySelector('#route-svg svg') !== null));
const titles = {};
for (const r of ['IR-193', 'VR-106', 'IR-155']) {
  await page.selectOption('#route-select', r);
  await page.waitForTimeout(200);
  titles[r] = await page.evaluate(() => document.querySelector('#route-svg svg text')?.textContent || null);
}
eq('IR-193 SVG title', titles['IR-193'], 'IR-193');
eq('VR-106 SVG title', titles['VR-106'], 'VR-106');
eq('IR-155 SVG title', titles['IR-155'], 'IR-155');

// ── 18. IR-154 Turn Points ──────────────────────────────────────────
await page.selectOption('#route-select', 'IR-154');
await page.waitForTimeout(150);
await page.click('#rd-toggle-turn');
await page.waitForTimeout(150);
const rows = await page.$$eval('#route-data-body tr', trs =>
  trs.map(t => [...t.querySelectorAll('td')].map(c => c.textContent.trim())));
eq('IR-154 Turn Points row count', rows.length, 13);
eq('IR-154 first turn row', rows[0], ['B1','122','3150M','3068M','3068M','3700M']);

// ── 19. Air Refueling badge checkboxes exist ────────────────────────
await clickTab('AR');
const arBadges = await page.$$eval('.chk-r, .chk-c', els => els.length);
ok('Has R/C badged checklist items', arBadges >= 7);

// ── 20. Toolbar scrolls with the page (not pinned) ─────────────────
await page.evaluate(() => window.scrollTo(0, 2000));
await page.waitForTimeout(150);
const tbTop = await page.evaluate(() => document.querySelector('.toolbar').getBoundingClientRect().top);
ok('Toolbar scrolls out of view when the page is scrolled', tbTop < -100);

// ── 21. No storage warning when localStorage works ──────────────────
const banner = await page.evaluate(() => document.getElementById('mdc-storage-warning'));
ok('No storage warning when localStorage works', !banner);

// ── 22. Box Setup × removes one row + Key Points layout ────────────
await clickTab('Brief');
const s1Before = await page.$$eval('#box-step1-list input', els => els.length);
await page.evaluate(() => document.querySelector('#box-step1-list li button').click());
await page.waitForTimeout(150);
const s1After = await page.$$eval('#box-step1-list input', els => els.length);
ok('Box Step 1 × removes one row', s1After === s1Before - 1);
// Key Points should sit on its own row spanning the full Box Setup width.
const layout = await page.evaluate(() => {
  const s1 = document.getElementById('box-step1-list').closest('.step-item').getBoundingClientRect();
  const kp = document.getElementById('box-keypoints-list').closest('.step-item').getBoundingClientRect();
  const grid = document.querySelector('.steps-grid').getBoundingClientRect();
  return {
    keyPointsBelowStep1: kp.top > s1.bottom,
    keyPointsFullWidth: Math.abs(kp.width - grid.width) < 4,
  };
});
ok('Key Points sits below Step 1 row', layout.keyPointsBelowStep1);
ok('Key Points spans full Box Setup width', layout.keyPointsFullWidth);

// ── 23. Downloaded HTML retains toolbar ─────────────────────────────
const html = await page.evaluate(() => {
  const clone = document.documentElement.cloneNode(true);
  return '<!DOCTYPE html>' + clone.outerHTML;
});
fs.writeFileSync(downloadOut, html);
const dlPage = await ctx.newPage();
await dlPage.goto('file://' + downloadOut, { waitUntil: 'networkidle' });
const dlBtns = await dlPage.$$eval('.toolbar button', els => els.map(e => e.textContent.trim()));
eq('Downloaded copy retains toolbar', dlBtns, ['Print / Save PDF', 'Download HTML', 'Reset']);
await dlPage.close();
fs.unlinkSync(downloadOut);

// ── 24. Defensive: removing per-button onclick still allows × ───────
await clickTab('Brief');
await page.evaluate(() =>
  document.querySelectorAll('#pattern-list [data-preset] button').forEach(b => b.onclick = null));
const beforeDel = await page.$$eval('#pattern-list [data-preset]', els => els.length);
await page.click('#pattern-list [data-preset]:first-child button');
await page.waitForTimeout(200);
const afterDel = await page.$$eval('#pattern-list [data-preset]', els => els.length);
ok('Delegated × handler removes pattern row even without per-button onclick',
  afterDel === beforeDel - 1);

// ── 25. No JS errors throughout ─────────────────────────────────────
ok('No page errors during the run', consoleErrors.length === 0,
  'errors: ' + consoleErrors.slice(0, 5).join(' | '));

await browser.close();

const passes = results.filter(r => r.status === 'PASS').length;
const fails  = results.filter(r => r.status === 'FAIL');
console.log('\n=== RESULTS ===');
results.forEach(r =>
  console.log((r.status === 'PASS' ? '✓' : '✗') + ' ' + r.name + (r.why ? '  →  ' + r.why : '')));
console.log(`\n${passes}/${results.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
