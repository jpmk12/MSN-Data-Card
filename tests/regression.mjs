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
eq('Callsign default NOGS 96',  await page.$eval('#hdr-callsign', e => e.value), 'NOGS 96');
eq('Header badge IPRQ FLT 3', await page.$eval('#hdr-flt', e => e.value), 'IPRQ FLT 3');
eq('Header badge is an editable input',
   await page.$eval('#hdr-flt', e => e.tagName + (e.readOnly ? ':ro' : '')), 'INPUT');
// Badge auto-grows with its text (size attribute tracks content length).
const fltGrow = await page.$eval('#hdr-flt', e => {
  const before = e.getBoundingClientRect().width;
  e.value = 'IPRQ FLT 1234567890 LONG';
  e.dispatchEvent(new Event('input', { bubbles: true }));
  return { grew: e.getBoundingClientRect().width > before, size: e.size };
});
ok('Header badge auto-grows with content', fltGrow.grew && fltGrow.size > 12);
await page.$eval('#hdr-flt', e => { e.value = 'IPRQ FLT 3'; e.dispatchEvent(new Event('input', { bubbles: true })); });
eq('Student 1 default DEAD',     await page.$eval('#hdr-student1', e => e.value), 'DEAD');
eq('Student 2 default DUFF',     await page.$eval('#hdr-student2', e => e.value), 'DUFF');

// ── 3. SOE defaults / calc ──────────────────────────────────────────
eq('Takeoff default 0130',         await page.$eval('#soe-takeoff', e => e.value), '0130');
eq('Low Level Entry default blank', await page.$eval('#soe-llentry', e => e.value), '');
eq('SCLZ TOT blank (LL Entry blank)', await page.$eval('#soe-lztime',  e => e.value), '');
eq('LL Exit default blank',        await page.$eval('#soe-llexit',  e => e.value), '');
eq('STLZ TOT blank (LL Entry blank)', await page.$eval('#soe-lz2tot',  e => e.value), '');
eq('ARCT default 0335',            await page.$eval('#soe-arct',    e => e.value), '0335');
eq('AREX default 0510',            await page.$eval('#soe-arex',    e => e.value), '0510');
const cells = await page.$$eval('#tab-main table tr', rows =>
  rows.map(r => [...r.querySelectorAll('td')].map(t => t.textContent.trim())));
// 0130 takeoff (Z, CDT −5): Alert −3:45 = 2145/1645, Show −3:30 = 2200/1700, Land +6 = 0730/0230
ok('SOE Alert back-calcs from 0130',     cells.some(r => r.includes('2145') && r.includes('1645')));
ok('SOE Show is takeoff − 3:30 (2200)',  cells.some(r => r.includes('2200') && r.includes('1700')));
ok('SOE Land row +6 from 0130 (0730)',   cells.some(r => r.includes('0730') && r.includes('0230')));

// ── 4. Route of Flight defaults + MOTA picker ───────────────────────
const rofDefault = 'KLTS OKKIE_.CDS LBB360030 AR197 LBB322047 CDS ZOCKS KLTS';
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

// ── 6b. AR Info default track ───────────────────────────────────────
eq('AR Track default AR197L', await page.$eval('#ar-track-select', e => e.value), 'AR197L');
eq('AR197L freqs populate',   await page.$eval('#ar-freqs', e => e.textContent), '264.900 | 236.650');
eq('AR197L TACAN populate',   await page.$eval('#ar-tacan', e => e.textContent), '62 / 125');
eq('AR197L BLOCK populate',   await page.$eval('#ar-block', e => e.textContent), 'FL190-220');
eq('Tanker default DASH 95',  await page.$eval('#ar-tanker', e => e.value), 'DASH 95');
eq('RZ Type default D (Pt Parallel)', await page.$eval('#ar-type-select', e => e.value), 'D (Pt Parallel)');
eq('AR SPD default 275 (KC-46)', await page.$eval('#ar-spd-select', e => e.value), '275 (KC-46)');
eq('TNKR Type default KC-46', await page.$eval('#ar-tnkr-type', e => e.value), 'KC-46');
// Brief-tab section renames.
const briefText = await page.$eval('#tab-main', e => e.textContent);
ok('Section renamed to "Air Refueling"', briefText.includes('Air Refueling') && !briefText.includes('AR Info'));
ok('Section renamed to "Low Level"', !briefText.includes('Low Level Info'));
// NA on the Air Refueling dropdown hides the AR data table.
await page.selectOption('#ar-track-select', 'NA');
await page.waitForTimeout(100);
ok('NA hides the Air Refueling table',
   await page.evaluate(() => getComputedStyle(document.getElementById('ar-info-table')).display === 'none'));
await page.selectOption('#ar-track-select', 'AR197L');
await page.waitForTimeout(100);
ok('AR197L shows the Air Refueling table again',
   await page.evaluate(() => getComputedStyle(document.getElementById('ar-info-table')).display !== 'none'));

// ── 7. SCLZ/STLZ TOT auto-derive + Slow 1 / Slow 2 offsets ───────────
// SCLZ TOT = LL Entry + 14, STLZ TOT = LL Entry + 31 (auto-calculated,
// read-only). Default LL Entry is blank → SCLZ/STLZ blank.
await page.fill('#soe-llentry', '2000');
await page.waitForTimeout(120);
eq('SCLZ TOT derives 2000+14=2014', await page.$eval('#soe-lztime', e => e.value), '2014');
eq('STLZ TOT derives 2000+31=2031', await page.$eval('#soe-lz2tot', e => e.value), '2031');
// Set LL Entry to 1900 for the remaining LL checks (sections 8/8b).
await page.fill('#soe-llentry', '1900');
await page.waitForTimeout(120);
eq('SCLZ TOT re-derives 1900+14=1914', await page.$eval('#soe-lztime', e => e.value), '1914');
eq('STLZ TOT re-derives 1900+31=1931', await page.$eval('#soe-lz2tot', e => e.value), '1931');
await page.selectOption('#ll-slow-offset', '180');
await page.waitForTimeout(150);
eq('Slow 1 = SCLZ 1914 − 3:00', await page.$eval('#ll-slow', e => e.textContent), '19:11:00');
// Default Slow 2 offset is −2:00 (120s)
eq('Slow 2 default = STLZ 1931 − 2:00', await page.$eval('#ll-slow2', e => e.textContent), '19:29:00');
// Change Slow 2 offset and verify it recomputes against STLZ TOT.
await page.selectOption('#ll-slow2-offset', '100');
await page.waitForTimeout(120);
eq('Slow 2 = STLZ 1931 − 1:40', await page.$eval('#ll-slow2', e => e.textContent), '19:29:20');

// ── 8. LL Info route picker + SCLZ/STLZ TOT visibility ──────────────
eq('LL Info default IR-154 Entry A', await page.$eval('#ll-entry-pt', e => e.textContent), 'A');
eq('LL Info default IR-154 Exit J',  await page.$eval('#ll-exit-pt',  e => e.textContent), 'J');
ok('SCLZ TOT row visible for IR-154',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-sclz-row')).display !== 'none'));
ok('STLZ TOT row visible for IR-154',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-stlz-row')).display !== 'none'));
// LL-tab IR-154 entry fixes: A = LL entry (1900), F = +19 (1919), J = +34 (1934)
eq('LL entry fix A = 1900', await page.$eval('#ll-fix-a', e => e.textContent), '1900');
eq('LL entry fix F = 1919', await page.$eval('#ll-fix-f', e => e.textContent), '1919');
eq('LL entry fix J = 1934', await page.$eval('#ll-fix-j', e => e.textContent), '1934');
ok('LL Entry lists Lubbock App / Abq Center freqs',
   (await page.$$eval('#ll-entry-list .ll-input', els => els.map(e => e.value)))
     .some(v => v.includes('Entry: Lubbock App: 119.2') &&
                v.includes('Pt J: Abq Center: 127.85') &&
                v.includes('285.475')));
await page.selectOption('#ll-route-select', 'IR-155');
await page.waitForTimeout(100);
eq('IR-155 Entry A after switch', await page.$eval('#ll-entry-pt', e => e.textContent), 'A');
eq('IR-155 Exit N after switch',  await page.$eval('#ll-exit-pt',  e => e.textContent), 'N');
ok('SCLZ TOT row hidden for IR-155',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-sclz-row')).display === 'none'));
ok('STLZ TOT row hidden for IR-155',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-stlz-row')).display === 'none'));
await page.selectOption('#ll-route-select', 'IR-193');
await page.waitForTimeout(100);
eq('IR-193 Entry placeholder —', await page.$eval('#ll-entry-pt', e => e.textContent), '—');
// Switch back to IR-154 so subsequent SCLZ/STLZ TOT edits work.
await page.selectOption('#ll-route-select', 'IR-154');
await page.waitForTimeout(100);

// ── 8b. Editable Low level X Check sections ─────────────────────────
const combatEntryDef = await page.$$eval('.ll-list[data-ll-key="combatEntry"] .ll-input', els => els.map(e => e.value));
eq('Combat Entry default items', combatEntryDef,
   ['RA MKR: 250 (50 feet - alt)', 'ESA in AFCS', 'GPWS/TAWS: Day 200/100 || Night 400/300']);
eq('PFARTSS has 7 default items',
   (await page.$$eval('.ll-list[data-ll-key="pfartss"] .ll-input', els => els.length)), 7);
eq('Descent Check starts empty',
   (await page.$$eval('.ll-list[data-ll-key="descent"] .ll-input', els => els.length)), 0);
// Nesting restored: Route Activation auth codes are sub-items.
const raRows = await page.$$eval('.ll-list[data-ll-key="routeActivation"] .ll-item-row',
  rows => rows.map(r => ({ text: r.querySelector('.ll-input').value, sub: r.getAttribute('data-sub') === '1' })));
eq('Route Activation: Authentication is a top item', raRows[0], { text: 'Authentication', sub: false });
eq('Route Activation: A-14-F is a sub-item', raRows[1], { text: 'A-14-F = Y', sub: true });
eq('Route Activation: Verify GUARD is a top item', raRows[4], { text: 'Verify contract GUARD active', sub: false });
eq('LZ Check-In: Clb left turn is a sub-item',
   (await page.$$eval('.ll-list[data-ll-key="lzCheckin"] .ll-item-row',
     rows => rows.map(r => r.getAttribute('data-sub') === '1'))), [false, false, true, true]);
// Indent toggle flips a row's level (then restore it). Use evaluate-click
// since the LL tab is hidden while the Brief tab is active.
await page.evaluate(() => document.querySelector('.ll-list[data-ll-key="combatEntry"] .ll-item-row .ll-indent').click());
await page.waitForTimeout(80);
eq('Indent toggle makes a row a sub-item',
   await page.$eval('.ll-list[data-ll-key="combatEntry"] .ll-item-row', r => r.getAttribute('data-sub')), '1');
await page.evaluate(() => document.querySelector('.ll-list[data-ll-key="combatEntry"] .ll-item-row .ll-indent').click());
await page.waitForTimeout(80);
eq('Indent toggle restores top-level',
   await page.$eval('.ll-list[data-ll-key="combatEntry"] .ll-item-row', r => r.getAttribute('data-sub')), '0');
// LL Entry default for IR-154 (route currently IR-154): IR-154 top item + common 3-6
eq('LL Entry IR-154 default list',
   await page.$$eval('#ll-entry-list .ll-input', els => els.map(e => e.value)), [
  'Maintain 4500-10,000 between A and B to deconflict with VR-1116',
  'Entry: Lubbock App: 119.2 | Pt J: Abq Center: 127.85 | 285.475',
  'Hack / Squawk / Talk',
  'Speed Limits',
  'Set Escape freq',
]);
ok('LL Entry fix line visible for IR-154',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-entry-fixes')).display !== 'none'));
// Switch to IR-155 → only common items 3-6, fix line hidden
await page.selectOption('#ll-route-select', 'IR-155');
await page.waitForTimeout(120);
eq('LL Entry IR-155 shows only common items',
   await page.$$eval('#ll-entry-list .ll-input', els => els.map(e => e.value)), [
  'Entry: Lubbock App: 119.2 | Pt J: Abq Center: 127.85 | 285.475',
  'Hack / Squawk / Talk',
  'Speed Limits',
  'Set Escape freq',
]);
ok('LL Entry fix line hidden for IR-155',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-entry-fixes')).display === 'none'));
// Edit an IR-155 item → per-route memory
await page.$eval('#ll-entry-list .ll-input', el => { el.value = 'EDITED 155'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(100);
await page.selectOption('#ll-route-select', 'IR-154');
await page.waitForTimeout(100);
eq('IR-154 list unaffected by IR-155 edit',
   (await page.$$eval('#ll-entry-list .ll-input', els => els.map(e => e.value)))[0],
   'Maintain 4500-10,000 between A and B to deconflict with VR-1116');
await page.selectOption('#ll-route-select', 'IR-155');
await page.waitForTimeout(100);
eq('IR-155 edit remembered per route',
   (await page.$$eval('#ll-entry-list .ll-input', els => els.map(e => e.value)))[0], 'EDITED 155');
// Add then remove on a generic section (evaluate-click; LL tab hidden).
await page.selectOption('#ll-route-select', 'IR-154');
await page.waitForTimeout(100);
await page.evaluate(() => document.querySelector('button[onclick="addLLItem(\'descent\')"]').click());
await page.waitForTimeout(100);
eq('Descent add creates a row',
   (await page.$$eval('.ll-list[data-ll-key="descent"] .ll-input', els => els.length)), 1);
await page.evaluate(() => document.querySelector('.ll-list[data-ll-key="descent"] .ll-rm').click());
await page.waitForTimeout(100);
eq('Descent remove clears the row',
   (await page.$$eval('.ll-list[data-ll-key="descent"] .ll-input', els => els.length)), 0);
// The two low-level route dropdowns stay in sync, either direction.
await page.selectOption('#ll-route-select', 'IR-155');
await page.waitForTimeout(100);
eq('Route Data dropdown follows Low Level Info',
   await page.$eval('#route-select', e => e.value), 'IR-155');
await page.evaluate(() => { const s = document.getElementById('route-select'); s.value = 'IR-154'; s.dispatchEvent(new Event('change', { bubbles: true })); });
await page.waitForTimeout(100);
eq('Low Level Info follows Route Data dropdown',
   await page.$eval('#ll-route-select', e => e.value), 'IR-154');
eq('LL Entry re-renders to IR-154 after Route Data switch',
   (await page.$$eval('#ll-entry-list .ll-input', els => els.length)), 5);
// NA route: Low Level Info data hidden, dropdowns synced, LL Entry empty.
await page.selectOption('#ll-route-select', 'NA');
await page.waitForTimeout(100);
ok('NA hides the Low Level Info table',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-info-table')).display === 'none'));
eq('NA syncs the Route Data dropdown', await page.$eval('#route-select', e => e.value), 'NA');
eq('NA Low Level Entry list is empty',
   (await page.$$eval('#ll-entry-list .ll-input', els => els.length)), 0);
ok('NA hides the IR-154 fix line',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-entry-fixes')).display === 'none'));
// Back to IR-154 → Low Level Info table shown again.
await page.selectOption('#ll-route-select', 'IR-154');
await page.waitForTimeout(100);
ok('IR-154 shows the Low Level Info table again',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-info-table')).display !== 'none'));

// ── 9. Safety Supplements dynamic ───────────────────────────────────
const ssActiveBase = await page.$$eval('#ss-active-list input.ss-input', els => els.map(e => e.value));
eq('Active has 1 default', ssActiveBase, [
  '1SS-326 -> MGPS & P-RAIM Induce Date Reversion',
]);
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
eq('EFB FLIP',     await page.$eval('#efb-flip', e => e.value), '06-11-2026 thru 07-08-2026');

// ── 11. Briefings / Notes ───────────────────────────────────────────
const noteDefaults = await page.$$eval('#notes-list .note-input', els => els.map(e => e.value));
eq('Briefings / Notes has 2 default notes', noteDefaults.length, 2);
ok('DEAD default note present', noteDefaults.some(v => v.startsWith('DEAD:')));
ok('DUFF default note present', noteDefaults.some(v => v.startsWith('DUFF:')));
eq('DEAD note covers engine start / 1st pattern work / ground ops',
   noteDefaults.find(v => v.startsWith('DEAD:')),
   'DEAD: engine start, 1st pattern work ||AR entry || back half LL || ground ops');
eq('DUFF note covers 2nd pattern work / back half AR / ground ops',
   noteDefaults.find(v => v.startsWith('DUFF:')),
   'DUFF: 2nd pattern work || back half AR, LL entry || ground ops');
await page.click('button[onclick="addNote()"]');
const lastNote = await page.$('#notes-list [data-note-row]:last-of-type .note-input');
await lastNote.fill('Weather check\nLine 2');
await page.waitForTimeout(150);

// ── 11b. Ground Ops defaults ────────────────────────────────────────
const groundOpsDefaults = await page.$$eval('#ground-ops-list > div', els =>
  els.map(r => r.querySelector('span')?.textContent.trim()).filter(Boolean));
eq('Ground Ops defaults are Backing + Star Turn', groundOpsDefaults, ['Backing', 'Star Turn']);

// ── 12. Box Setup defaults ──────────────────────────────────────────
const box = await page.evaluate(() => ({
  s1: [...document.querySelectorAll('#box-step1-list input')].map(i => i.value),
  s2: [...document.querySelectorAll('#box-step2-list input')].map(i => i.value),
  s3: [...document.querySelectorAll('#box-step3-list input')].map(i => i.value),
  kp: [...document.querySelectorAll('#box-keypoints-list input')].map(i => i.value),
}));
eq('Box Step 1 defaults', box.s1, ['TAC Pts in SEC', 'Build FLT plan', 'Fix times']);
eq('Box Step 2 defaults', box.s2, ['LZ Ldg/TO Told', 'Add BULL', 'Build Orbit at FLOYD']);
eq('Box Step 3 empty by default', box.s3, []);
eq('Box Notes has 2 defaults', box.kp, [
  "1 min per 10,000' or 6 sec per 1,000' when TOC or BOD is prior to a waypoint",
  'Be 1 min late every 10K of climb / Be 1 min early every 10K of descent',
]);

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
eq('Persist: SCLZ TOT re-derives to 1914', await page.$eval('#soe-lztime', e => e.value), '1914');
eq('Persist: Slow offset', await page.$eval('#ll-slow-offset', e => e.value), '180');
const patPersist = await page.$$eval('#pattern-list [data-preset]', els => els.map(e => e.getAttribute('data-preset')));
eq('Persist: Pattern after × + Custom', patPersist, ['DUKE BEAM', 'DUKE ACCEL 6500', 'STR IN', 'Custom']);
eq('Persist: Custom row text',
  await page.$eval('#pattern-list [data-preset="Custom"] input.pattern-custom-input', e => e.value),
  'Touch and go RWY 36');
const ssAfter = await page.$$eval('#ss-incorporated-list input.ss-input', els => els.map(e => e.value));
ok('Persist: empty SS row dropped', ssAfter.length === 4 && ssAfter.every(v => v.trim()));
const notesAfter = await page.$$eval('#notes-list .note-input', els => els.map(e => e.value));
ok('Persist: 2 defaults + the typed note', notesAfter.length === 3 && notesAfter[notesAfter.length - 1] === 'Weather check\nLine 2');
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
eq('Reset: Callsign default', await page.$eval('#hdr-callsign', e => e.value), 'NOGS 96');
eq('Reset: ARCT back to default 0335', await page.$eval('#soe-arct',    e => e.value), '0335');
eq('Reset: AREX back to default 0510', await page.$eval('#soe-arex',    e => e.value), '0510');
eq('Reset: LL Entry back to blank',    await page.$eval('#soe-llentry', e => e.value), '');
eq('Reset: SCLZ TOT back to blank',    await page.$eval('#soe-lztime',  e => e.value), '');
eq('Reset: LL Exit back to blank',     await page.$eval('#soe-llexit',  e => e.value), '');
eq('Reset: STLZ TOT back to blank',    await page.$eval('#soe-lz2tot',  e => e.value), '');
eq('Reset: Takeoff back to 0130',      await page.$eval('#soe-takeoff', e => e.value), '0130');
const patReset = await page.$$eval('#pattern-list [data-preset]', els => els.map(e => e.getAttribute('data-preset')));
eq('Reset: Pattern 4 defaults', patReset, ['DUKE TAC 6500', 'DUKE BEAM', 'DUKE ACCEL 6500', 'STR IN']);
eq('Reset: Slow 1 offset default', await page.$eval('#ll-slow-offset',  e => e.value), '120');
eq('Reset: Slow 2 offset default', await page.$eval('#ll-slow2-offset', e => e.value), '120');

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
eq('Downloaded copy retains toolbar', dlBtns, ['Print / Save PDF', 'Download HTML', 'Import', 'Reset']);
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

// ── 25. Schedule + AMT importer ─────────────────────────────────────
const amtSample = [
  '                     AMT FOR AIRCREW - AIRLAND',
  '           CALLSIGN             Course       Ride          Low Level         Entry (z)      Exit (z)           LZ1        TOT1        LZ2      TOT2     Local Date',
  '           CADDO 10             IAC          2             IR154                  17:15       17:49            SCLZ       17:29      STLZ      17:46         9-Jun',
  ''
].join('\n');
const schedSample = [
  'CALLSIGN: CADDO10                                                                       AR TRACK: AR 312L                                                          Config: STD',
  'FUEL: 120K                                                                              RZ TYPE: G                                                                 Load: Load 5',
  'SHOW/BUS: 0615 /                                                                        ARCT: 1515Z                                                                Flt Remarks: IPRQ 15-1',
  'DATE: 09 JUN 2026                                                                       AREX: 1635Z',
  'TO: KLTS - 0945(L) / 1445(Z)                                                            TNKR C/S: NITRO 63',
  'DUR: 6.0                                                                                TNKR TYPE: KC-135'
].join('\n');
await freshLoad();
await page.click('button[onclick="openImport()"]');
await page.waitForTimeout(150);
await page.fill('#import-callsign', 'CADDO 10');
await page.fill('#import-amt', amtSample);
await page.fill('#import-sched', schedSample);
await page.click('button[onclick="applyImport()"]');
await page.waitForTimeout(800);
const imp = await page.evaluate(() => ({
  takeoff: document.getElementById('soe-takeoff').value,
  arct:    document.getElementById('soe-arct').value,
  arex:    document.getElementById('soe-arex').value,
  tanker:  document.getElementById('ar-tanker').value,
  tnkrType:document.getElementById('ar-tnkr-type').value,
  arTrack: document.getElementById('ar-track-select').value,
  arType:  document.getElementById('ar-type-select').value,
  llRoute: document.getElementById('ll-route-select').value,
  llEntry: document.getElementById('soe-llentry').value,
  llExit:  document.getElementById('soe-llexit').value,
  sclz:    document.getElementById('soe-lztime').value,
  stlz:    document.getElementById('soe-lz2tot').value,
}));
eq('Import: Takeoff (1445)',  imp.takeoff,  '1445');
eq('Import: ARCT (1515)',     imp.arct,     '1515');
eq('Import: AREX (1635)',     imp.arex,     '1635');
eq('Import: Tanker (NITRO 63)', imp.tanker, 'NITRO 63');
eq('Import: TNKR Type KC-135',  imp.tnkrType, 'KC-135');
eq('Import: AR Track AR312L',   imp.arTrack,  'AR312L');
eq('Import: RZ Type G',         imp.arType,   'G (Enroute)');
eq('Import: LL Route IR-154',   imp.llRoute,  'IR-154');
eq('Import: LL Entry 1715',     imp.llEntry,  '1715');
eq('Import: LL Exit 1749',      imp.llExit,   '1749');
eq('Import: SCLZ TOT 1729',     imp.sclz,     '1729');
eq('Import: STLZ TOT 1746',     imp.stlz,     '1746');

// AR Track variants now have proper options. "AR 197L" should match AR197L
// exactly (no fallback to AR197H).
const schedAR197L = [
  'CALLSIGN: CADDO50',
  'TO: KLTS - 0900(L) / 1400(Z)',
  'AR TRACK: AR 197L',
  'RZ TYPE: G',
  'ARCT: 1400Z',
  'AREX: 1600Z',
  'TNKR C/S: NITRO 1',
  'TNKR TYPE: KC-46',
].join('\n');
await freshLoad();
await page.click('button[onclick="openImport()"]');
await page.waitForTimeout(150);
await page.fill('#import-callsign', 'CADDO 50');
await page.fill('#import-sched', schedAR197L);
await page.click('button[onclick="applyImport()"]');
await page.waitForTimeout(800);
const ar197lImport = await page.evaluate(() => ({
  track: document.getElementById('ar-track-select').value,
  freqs: document.getElementById('ar-freqs').textContent,
  tacan: document.getElementById('ar-tacan').textContent,
  block: document.getElementById('ar-block').textContent,
  tnkrType: document.getElementById('ar-tnkr-type').value,
}));
eq('Import: AR 197L → AR197L', ar197lImport.track, 'AR197L');
eq('Import: AR197L freqs',     ar197lImport.freqs, '264.900 | 236.650');
eq('Import: AR197L TACAN',     ar197lImport.tacan, '62 / 125');
eq('Import: AR197L BLOCK',     ar197lImport.block, 'FL190-220');
eq('Import: TNKR Type KC-46',  ar197lImport.tnkrType, 'KC-46');

// Legacy persisted 'AR197' should migrate to 'AR197H' on next load.
await page.evaluate(() => {
  localStorage.setItem('iprq-bros-mdc-v1', JSON.stringify({
    inputs: { 'ar-track-select': 'AR197' }
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
eq('Legacy AR197 migrates to AR197H',
  await page.$eval('#ar-track-select', e => e.value),
  'AR197H');

// Column-split AMT paste (PDF copy-paste flattens columns into a callsign
// list at the bottom). The 5th callsign should map to the 5th data row,
// even with single-digit hours.
const amtColSplit = [
  'Course Ride Low Level Entry (z) Exit (z) LZ1 TOT1 LZ2 TOT2 Local Date',
  'PCO 6E IR154 16:55 17:29 SCLZ 17:09 STLZ 17:26 9-Jun',
  'IAC 2 IR154 17:15 17:49 SCLZ 17:29 STLZ 17:46 9-Jun',
  'PCO 2 IR154 17:25 17:59 SCLZ 17:39 STLZ 17:56 9-Jun',
  'IAC 2 IR154 17:45 18:19 SCLZ 17:59 STLZ 18:16 9-Jun',
  'IAC 3 IR154 3:40 4:14 SCLZ 3:54 STLZ 4:11 9-Jun',
  'PIQ 2 IR154 2:20 2:54 SCLZ 2:34 STLZ 2:51 9-Jun',
  'CALLSIGN',
  'CADDO 50',
  'CADDO 10',
  'CADDO 44',
  'CADDO 27',
  'NOGS 18',
  'NOGS 48',
  'WRITE CHANGES BELOW THIS LINE'
].join('\n');
await freshLoad();
await page.click('button[onclick="openImport()"]');
await page.waitForTimeout(150);
await page.fill('#import-callsign', 'NOGS 18');
await page.fill('#import-amt', amtColSplit);
await page.click('button[onclick="applyImport()"]');
await page.waitForTimeout(800);
const splitRow = await page.evaluate(() => ({
  llRoute: document.getElementById('ll-route-select').value,
  llEntry: document.getElementById('soe-llentry').value,
  llExit:  document.getElementById('soe-llexit').value,
  sclz:    document.getElementById('soe-lztime').value,
  stlz:    document.getElementById('soe-lz2tot').value,
}));
eq('Column-split: NOGS 18 LL Route IR-154', splitRow.llRoute, 'IR-154');
eq('Column-split: NOGS 18 LL Entry 0340',   splitRow.llEntry, '0340');
eq('Column-split: NOGS 18 LL Exit 0414',    splitRow.llExit,  '0414');
eq('Column-split: NOGS 18 SCLZ TOT 0354',   splitRow.sclz,    '0354');
eq('Column-split: NOGS 18 STLZ TOT 0411',   splitRow.stlz,    '0411');

// Missing callsign should not modify anything and should show an error status.
await page.click('button[onclick="openImport()"]');
await page.waitForTimeout(150);
await page.fill('#import-callsign', 'NOPE 99');
await page.fill('#import-amt', amtSample);
await page.fill('#import-sched', schedSample);
await page.click('button[onclick="applyImport()"]');
await page.waitForTimeout(300);
const missingStatus = await page.evaluate(() => document.getElementById('import-status').textContent);
ok('Import: missing callsign reports not-found', /not found/i.test(missingStatus));

// ── 25b. Notional LZ Weather card (Scenario tab) ─────────────────────────
const wxHeader = await page.$eval('#notion-weather-card .card-header',
  e => e.textContent.replace(/\s+/g, ' ').trim());
ok('Notional LZ Weather card title present', /Notional LZ Weather/.test(wxHeader));
const wxRows = await page.$$eval('#notion-weather-list .wx-row',
  els => els.map(e => e.textContent.trim()));
eq('Notional LZ Weather has 9 station rows', wxRows.length, 9);
eq('Notional LZ Weather first row is HELZ', wxRows[0],
   'HELZ 1535Z 09010G13 10SM SCT050 SCT100 25/07 QNH2992INS');
eq('Notional LZ Weather last row is WILZ', wxRows[8],
   'WILZ 1555Z 15003 P6SM SCT180 25/21');
ok('Notional LZ Weather lists all 9 LZ identifiers',
   ['HELZ','LYLZ','MCLZ','SCLZ','STUZ','GDLZ','SMIZ','ROLZ','WILZ']
     .every((id, i) => wxRows[i].startsWith(id)));

// ── 25c. IR-154 Threat Plot card (Scenario tab) ─────────────────────
const tpHeader = await page.$eval('#ir154-threat-plot-card .card-header',
  e => e.textContent.replace(/\s+/g, ' ').trim());
ok('IR-154 Threat Plot card title present', /IR-154 Threat Plot/.test(tpHeader));
const threatRows = await page.$$eval('#ir154-threat-plot-card tbody .threat-row',
  els => els.map(r => [...r.querySelectorAll('td')].map(t => t.textContent.trim())));
eq('Threat Plot has 4 rows', threatRows.length, 4);
eq('Threat 1 row', threatRows[0],
   ['Threat 1', 'LBB/R106065', 'N 33 12 23.5', 'W 100 45 16.8']);
eq('Threat 2 row', threatRows[1],
   ['Threat 2', 'LBB/R114088', 'N 32 51 30.8', 'W 100 28 46.6']);
eq('Threat 3 row', threatRows[2],
   ['Threat 3', 'LBB/R083059', 'N 33 37 45.5', 'W 100 44 41.8']);
eq('Threat 4 row', threatRows[3],
   ['Threat 4', 'LBB/R066076', 'N 33 59 24.6', 'W 100 26 06.4']);

// ── 26. Ground Ops stale-state self-heal ───────────────────────────
await page.evaluate(() => {
  localStorage.setItem('iprq-bros-mdc-v1', JSON.stringify({
    groundOps: ['Backing', 'Backing', 'Star Turn', 'NOPE', 'Star Turn', 'Backing']
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const healedGops = await page.$$eval('#ground-ops-list > div', els =>
  els.map(r => r.querySelector('span')?.textContent.trim()).filter(Boolean));
eq('Stale Ground Ops state dedupes + drops unknown on load',
   healedGops, ['Backing', 'Star Turn']);

// ── 27. No JS errors throughout ─────────────────────────────────────
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
