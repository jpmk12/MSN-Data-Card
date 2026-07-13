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
eq('Callsign default CADDO 96',  await page.$eval('#hdr-callsign', e => e.value), 'CADDO 96');
eq('Header badge Local', await page.$eval('#hdr-flt', e => e.value), 'Local');
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
await page.$eval('#hdr-flt', e => { e.value = 'Local'; e.dispatchEvent(new Event('input', { bubbles: true })); });
eq('Left Seat default DEAD',     await page.$eval('#hdr-student1', e => e.value), 'DEAD');
eq('Right Seat default DUFF',    await page.$eval('#hdr-student2', e => e.value), 'DUFF');

// ── 3. SOE defaults / calc ──────────────────────────────────────────
eq('Takeoff default 1415',         await page.$eval('#soe-takeoff', e => e.value), '1415');
eq('Low Level Entry default 1900', await page.$eval('#soe-llentry', e => e.value), '1900');
eq('SCLZ TOT default 1914 (IR-154)', await page.$eval('#soe-lztime',  e => e.value), '1914');
eq('LL Exit default 1934',         await page.$eval('#soe-llexit',  e => e.value), '1934');
eq('STLZ TOT default 1931 (IR-154)', await page.$eval('#soe-lz2tot',  e => e.value), '1931');
eq('ARCT default 1700',            await page.$eval('#soe-arct',    e => e.value), '1700');
eq('AREX default 1835',            await page.$eval('#soe-arex',    e => e.value), '1835');
const cells = await page.$$eval('#tab-main table tr', rows =>
  rows.map(r => [...r.querySelectorAll('td')].map(t => t.textContent.trim())));
// 1415 takeoff (Z, EDT −4 default): Alert −3:45 = 1030/0630,
// Show −3:30 = 1045/0645, Land +6:00 = 2015/1615.
ok('SOE Alert back-calcs from 1415 (−3:45 = 1030)', cells.some(r => r.includes('1030') && r.includes('0630')));
ok('SOE Show back-calcs from 1415 (−3:30 = 1045)', cells.some(r => r.includes('1045') && r.includes('0645')));
eq('Land offset default +6:00', await page.$eval('#soe-land-offset', e => e.value), '360');
ok('SOE Land row +6:00 from 1415 (2015)', cells.some(r => r.includes('2015') && r.includes('1615')));
// Land offset is configurable: switch to +5:00 → 1915/1515.
await page.selectOption('#soe-land-offset', '300');
await page.waitForTimeout(100);
eq('Land recomputes at +5:00 (1915)', await page.$eval('#soe-land', e => e.textContent), '1915');
eq('Land local recomputes at +5:00 (1515)', await page.$eval('#soe-land-l', e => e.textContent), '1515');
await page.selectOption('#soe-land-offset', '360');
await page.waitForTimeout(100);
// Alert and Show are independently selectable offsets prior to takeoff.
// Defaults: Show 3+30 (−210), Alert 3+45 (−225).
eq('Show offset default 3+30', await page.$eval('#soe-show-offset', e => e.value), '-210');
eq('Alert offset default 3+45', await page.$eval('#soe-alert-offset', e => e.value), '-225');
await page.selectOption('#soe-show-offset', '-240'); // 4+00 before takeoff
await page.waitForTimeout(100);
eq('Show recomputes at −4:00 (1015)', await page.$eval('#soe-show', e => e.textContent), '1015');
eq('Alert unchanged by Show (still 1030)', await page.$eval('#soe-alert', e => e.textContent), '1030');
await page.selectOption('#soe-alert-offset', '-240'); // 4+00 before takeoff
await page.waitForTimeout(100);
eq('Alert recomputes at −4:00 (1015)', await page.$eval('#soe-alert', e => e.textContent), '1015');
await page.selectOption('#soe-show-offset', '-210');
await page.selectOption('#soe-alert-offset', '-225');
await page.waitForTimeout(100);
// Manual SOE rows show a calculated local time (Zulu + DST). EDT −4 default:
// LL Entry 1900→1500L, LL Exit 1934→1534L, ARCT 1700→1300L, AREX 1835→1435L.
eq('LL Entry local (EDT) 1500L', await page.$eval('#soe-llentry-l', e => e.textContent), '1500L');
eq('LL Exit local (EDT) 1534L',  await page.$eval('#soe-llexit-l',  e => e.textContent), '1534L');
eq('ARCT local (EDT) 1300L',     await page.$eval('#soe-arct-l',    e => e.textContent), '1300L');
eq('AREX local (EDT) 1435L',     await page.$eval('#soe-arex-l',    e => e.textContent), '1435L');
// DST toggle to CST (−6) shifts the locals back two hours from EDT.
await page.selectOption('#soe-dst', '-6');
await page.waitForTimeout(100);
eq('LL Entry local recomputes at CST (1300L)', await page.$eval('#soe-llentry-l', e => e.textContent), '1300L');
await page.selectOption('#soe-dst', '-4');
await page.waitForTimeout(100);

// ── 4. Route of Flight defaults + MOTA picker ───────────────────────
eq('Route of Flight blank by default', await page.$eval('#rof-input', e => e.value), '');
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

// ── 5. Pattern Work: empty by default, add presets + Custom + remove ─
let pat = await page.$$eval('#pattern-list [data-preset]', els => els.map(e => e.getAttribute('data-preset')));
eq('Pattern Work empty by default', pat, []);
// Add three presets, a Custom row, then remove one.
for (const v of ['DUKE TAC 6500', 'DUKE BEAM', 'DUKE ACCEL 6500', 'STR IN']) {
  await page.selectOption('#pattern-select', v);
  await page.click('button[onclick="addPatternItem()"]');
}
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
eq('AR Track default AR197H', await page.$eval('#ar-track-select', e => e.value), 'AR197H');
eq('AR197H freqs populate',   await page.$eval('#ar-freqs', e => e.textContent), '302.250 | 320.525');
eq('AR197H TACAN populate',   await page.$eval('#ar-tacan', e => e.textContent), '58 / 121');
eq('AR197H BLOCK populate',   await page.$eval('#ar-block', e => e.textContent), 'FL240-260');
eq('Tanker default DASH 85',  await page.$eval('#ar-tanker', e => e.value), 'DASH 85');
eq('RZ Type default G (Enroute)', await page.$eval('#ar-type-select', e => e.value), 'G (Enroute)');
eq('AR SPD default 275 (KC-46)', await page.$eval('#ar-spd-select', e => e.value), '275 (KC-46)');
eq('TNKR Type default KC-46', await page.$eval('#ar-tnkr-type', e => e.value), 'KC-46');
// TNKR Type drives AR SPD: KC-46 -> 275, KC-135 -> 265.
await page.selectOption('#ar-tnkr-type', 'KC-46');
await page.waitForTimeout(100);
eq('TNKR KC-46 sets AR SPD 275', await page.$eval('#ar-spd-select', e => e.value), '275 (KC-46)');
await page.selectOption('#ar-tnkr-type', 'KC-135');
await page.waitForTimeout(100);
eq('TNKR KC-135 sets AR SPD 265', await page.$eval('#ar-spd-select', e => e.value), '265 (KC-135)');
// Brief-tab section renames.
const briefText = await page.$eval('#tab-main', e => e.textContent);
ok('Section renamed to "Air Refueling"', briefText.includes('Air Refueling') && !briefText.includes('AR Info'));
ok('Section renamed to "Low Level"', !briefText.includes('Low Level Info'));
// NA on the Air Refueling dropdown hides the AR data table.
await page.selectOption('#ar-track-select', 'NA');
await page.waitForTimeout(100);
ok('NA hides the Air Refueling table',
   await page.evaluate(() => getComputedStyle(document.getElementById('ar-info-table')).display === 'none'));
await page.selectOption('#ar-track-select', 'AR312L');
await page.waitForTimeout(100);
ok('AR312L shows the Air Refueling table again',
   await page.evaluate(() => getComputedStyle(document.getElementById('ar-info-table')).display !== 'none'));

// ── 7. IR-154 SCLZ/STLZ TOT auto-derive + Slow 1 / Slow 2 offsets ────
// On IR-154 the two LZ TOTs auto-derive (read-only): SCLZ = LL Entry + 14,
// STLZ = LL Entry + 31. (IR-155 GDLZ/SMLZ derive +19 / +36 — see §8.)
// LL route defaults to IR-154 (Low Level Info shown). NA still hides the
// table; switch back to IR-154 for the IR-154-specific checks below.
eq('LL route default IR-154', await page.$eval('#ll-route-select', e => e.value), 'IR-154');
ok('IR-154 shows Low Level Info table by default',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-info-table')).display !== 'none'));
await page.selectOption('#ll-route-select', 'NA');
await page.waitForTimeout(120);
ok('NA hides Low Level Info table',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-info-table')).display === 'none'));
await page.selectOption('#ll-route-select', 'IR-154');
await page.waitForTimeout(120);
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
ok('LL Entry lists the IR-154 deconfliction note',
   (await page.$$eval('#ll-entry-list .ll-input', els => els.map(e => e.value)))
     .some(v => v.includes('Maintain 4500-10,000 between A and B')));
await page.selectOption('#ll-route-select', 'IR-155');
await page.waitForTimeout(100);
eq('IR-155 Entry A after switch', await page.$eval('#ll-entry-pt', e => e.textContent), 'A');
eq('IR-155 Exit N after switch',  await page.$eval('#ll-exit-pt',  e => e.textContent), 'N');
ok('LZ row 1 visible for IR-155',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-sclz-row')).display !== 'none'));
ok('LZ row 2 visible for IR-155',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-stlz-row')).display !== 'none'));
eq('IR-155 LZ1 label GDLZ TOT', await page.$eval('#ll-lz1-label', e => e.textContent), 'GDLZ TOT');
eq('IR-155 LZ2 label SMLZ TOT', await page.$eval('#ll-lz2-label', e => e.textContent), 'SMLZ TOT');
// IR-155 GDLZ/SMLZ derive from LL Entry (read-only): +19 / +36. LL Entry is 1900.
eq('IR-155 GDLZ TOT = LL Entry + 19 (1919)', await page.$eval('#soe-lztime', e => e.value), '1919');
eq('IR-155 SMLZ TOT = LL Entry + 36 (1936)', await page.$eval('#soe-lz2tot', e => e.value), '1936');
ok('IR-155 GDLZ TOT is read-only (derived)', await page.$eval('#soe-lztime', e => e.readOnly));
// IR-155 entry fix line: Entry to K = +39 (1939), Entry to N = +44 (1944).
ok('IR-155 entry fix line visible',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-entry-fixes-155')).display !== 'none'));
ok('IR-154 entry fix line hidden on IR-155',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-entry-fixes')).display === 'none'));
eq('IR-155 A = LL Entry (1900)', await page.$eval('#ll-fix-a155', e => e.textContent), '1900');
eq('IR-155 Entry to K = LL Entry + 39 (1939)', await page.$eval('#ll-fix-k', e => e.textContent), '1939');
eq('IR-155 Entry to N = LL Entry + 44 (1944)', await page.$eval('#ll-fix-n', e => e.textContent), '1944');
// JUNVA run-in (IR-155): LL Entry 1900 − 9:30 = 18:50:30, shown at the top.
ok('IR-155 JUNVA line visible',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-junva-155')).display !== 'none'));
eq('IR-155 JUNVA = LL Entry − 9:30 (18:50:30)', await page.$eval('#ll-junva-time', e => e.textContent), '18:50:30');
// Slow 1/Slow 2 compute from the derived LZ TOT minus the adjacent offset.
// (§7 left the offsets at −3:00 / −1:40; reset both to the −2:00 default.)
await page.selectOption('#ll-slow-offset', '120');
await page.selectOption('#ll-slow2-offset', '120');
await page.waitForTimeout(120);
eq('IR-155 Slow 1 = GDLZ 1919 − 2:00', await page.$eval('#ll-slow', e => e.textContent), '19:17:00');
eq('IR-155 Slow 2 = SMLZ 1936 − 2:00', await page.$eval('#ll-slow2', e => e.textContent), '19:34:00');
// GDLZ / Entry-to-K track LL Entry edits.
await page.fill('#soe-llentry', '2000');
await page.waitForTimeout(120);
eq('IR-155 GDLZ re-derives to 2019', await page.$eval('#soe-lztime', e => e.value), '2019');
eq('IR-155 Entry to K re-derives to 2039', await page.$eval('#ll-fix-k', e => e.textContent), '2039');
await page.fill('#soe-llentry', '1900');   // restore for later sections
await page.waitForTimeout(120);
// Restore the §7 offsets (−3:00 / −1:40) so the §14 persistence check holds.
await page.selectOption('#ll-slow-offset', '180');
await page.selectOption('#ll-slow2-offset', '100');
await page.waitForTimeout(120);
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
eq('Route Activation: Verify contracts is a top item', raRows[4], { text: 'Verify contracts active', sub: false });
eq('LZ Check-In editable list is empty by default',
   (await page.$$eval('.ll-list[data-ll-key="lzCheckin"] .ll-input', els => els.map(e => e.value))),
   []);
// IR-154 SCLZ/STLZ Escape callout (route-toggled, important styling).
ok('LZ Check-In Escape callout visible for IR-154',
   await page.evaluate(() => getComputedStyle(document.getElementById('lz-checkin-154')).display !== 'none'));
eq('LZ Check-In Escape callout values',
   await page.$$eval('#lz-checkin-154 .ll-imp-callout', els => els.map(e => e.textContent.trim())),
   ['SCLZ R35 -> Escape: 2759 MSA', 'STLZ R35 -> Escape: 5000 Top of Block']);
eq('LZ Check-In Request rancher lines (IR-154)',
   await page.$$eval('#lz-checkin-154 .item', els => els.map(e => e.textContent.trim())),
   ['Request rancher -> SCLZ by C1', 'Request rancher -> STLZ by I1']);
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
// LL Entry default for IR-154 (route currently IR-154): IR-154 top item + common
eq('LL Entry IR-154 default list',
   await page.$$eval('#ll-entry-list .ll-input', els => els.map(e => e.value)), [
  'Maintain 4500-10,000 between A and B to deconflict with VR-1116',
  'Hack / Squawk / Talk',
  'Speed Limits',
  'Set Escape freq',
]);
ok('LL Entry fix line visible for IR-154',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-entry-fixes')).display !== 'none'));
ok('IR-155 JUNVA line hidden for IR-154',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-junva-155')).display === 'none'));
// IR-154 FLOYD/O run-in line (LL Entry 1900): −8:40/−13:40/−18:40/−23:40.
ok('IR-154 FLOYD run-in line visible',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-floyd-154')).display !== 'none'));
eq('IR-154 FLOYD = LL Entry − 8:40 (18:51:20)', await page.$eval('#ll-floyd-t', e => e.textContent), '18:51:20');
eq('IR-154 O1 = LL Entry − 13:40 (18:46:20)', await page.$eval('#ll-o1-t', e => e.textContent), '18:46:20');
eq('IR-154 O2 = LL Entry − 18:40 (18:41:20)', await page.$eval('#ll-o2-t', e => e.textContent), '18:41:20');
eq('IR-154 O3 = LL Entry − 23:40 (18:36:20)', await page.$eval('#ll-o3-t', e => e.textContent), '18:36:20');
// Switch to IR-155 → IR-155 route items + common, fix line hidden
await page.selectOption('#ll-route-select', 'IR-155');
await page.waitForTimeout(120);
eq('LL Entry IR-155 route + common items',
   await page.$$eval('#ll-entry-list .ll-input', els => els.map(e => e.value)), [
  'A - B -> 1.5NM wide',
  'GDLZ (R35) -> Escape to 3700',
  'Reporting Point G -> Amarillo: 319.15',
  'Overfly G to avoid T25 town of Goodnight',
  'Remain east of center @ I -> Avoid Claude wind farm',
  'SMLZ (R18) -> Escape to 5K',
  'Hack / Squawk / Talk',
  'Speed Limits',
  'Set Escape freq',
]);
ok('LL Entry fix line hidden for IR-155',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-entry-fixes')).display === 'none'));
ok('LZ Check-In Escape callout hidden for IR-155',
   await page.evaluate(() => getComputedStyle(document.getElementById('lz-checkin-154')).display === 'none'));
ok('IR-154 FLOYD run-in line hidden for IR-155',
   await page.evaluate(() => getComputedStyle(document.getElementById('ll-floyd-154')).display === 'none'));
// The three critical IR-155 rows are flagged important (highlight + star icon).
eq('LL Entry important rows (IR-155)',
   await page.$$eval('#ll-entry-list .ll-item-row[data-important="1"] .ll-input', els => els.map(e => e.value)),
   ['GDLZ (R35) -> Escape to 3700', 'Reporting Point G -> Amarillo: 319.15', 'SMLZ (R18) -> Escape to 5K']);
eq('LL Entry important rows show a star icon',
   await page.$$eval('#ll-entry-list .ll-item-row[data-important="1"] .ll-imp-icon', els => els.length), 3);
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
// Scenario Objectives are route-dependent (mirrors Low Level Entry).
eq('Scenario Objectives IR-155 default',
   await page.$$eval('.ll-list[data-ll-key="scenarioObjectives"] .ll-input', els => els.map(e => e.value)),
   ['VIRUS 295/100', 'VIRUS 276/95', 'VIRUS 295/86', 'VIRUS 289/11', 'VIRUS 272/72']);
await page.selectOption('#ll-route-select', 'IR-154');
await page.waitForTimeout(100);
eq('Scenario Objectives IR-154 default (empty)',
   await page.$$eval('.ll-list[data-ll-key="scenarioObjectives"] .ll-input', els => els.map(e => e.value)),
   []);
await page.selectOption('#ll-route-select', 'IR-155');
await page.waitForTimeout(100);
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
// Time Control reference card (Low Level tab GK reference).
eq('Time Control card present',
   await page.evaluate(() => [...document.querySelectorAll('#tab-llgk .card-header')].some(h => h.textContent.includes('Time Control'))), true);
eq('Time Control categories', await page.$$eval('#tab-llgk .tc-cat', els => els.map(e => e.textContent.trim())),
   ['Speeds', 'Altitude', 'Winds']);
eq('Time Control has 15 pills', await page.$$eval('#tab-llgk .tc-pill', els => els.length), 15);
ok('Time Control lists the 5-minute MC update',
   await page.evaluate(() => [...document.querySelectorAll('#tab-llgk .item')].some(i => i.textContent.includes('updated every 5 minutes'))));
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
   (await page.$$eval('#ll-entry-list .ll-input', els => els.length)), 4);
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
eq('EFB iOS',      await page.$eval('#efb-ios', e => e.value), '26.5 CAO 27 May 26');
eq('EFB Pub Sync', await page.$eval('#efb-pubsync', e => e.value), '26 May 2026');
eq('EFB FLIP',     await page.$eval('#efb-flip', e => e.value), '06-11-2026 thru 07-08-2026');

// ── 11. Briefings / Notes ───────────────────────────────────────────
const noteDefaults = await page.$$eval('#notes-list .note-input', els => els.map(e => e.value));
eq('Briefings / Notes has 1 default note', noteDefaults.length, 1);
ok('DUFF/DEAD default notes removed', !noteDefaults.some(v => v.startsWith('DUFF:') || v.startsWith('DEAD:')));
eq('MIN FLAP Emphasis default note',
   noteDefaults.find(v => v.startsWith('MIN FLAP')),
   'MIN FLAP Emphasis: selected OFF when: EOCS REQUIRED YES // CG < 28% or > 39% // Crosswind > 25 kts');
await page.click('button[onclick="addNote()"]');
const lastNote = await page.$('#notes-list [data-note-row]:last-of-type .note-input');
await lastNote.fill('Weather check\nLine 2');
await page.waitForTimeout(150);

// ── 11b. Ground Ops: empty by default (crews add their own) ─────────
const groundOpsDefaults = await page.$$eval('#ground-ops-list > div', els =>
  els.map(r => r.querySelector('span')?.textContent.trim()).filter(Boolean));
eq('Ground Ops empty by default', groundOpsDefaults, []);

// ── 12. Box Setup defaults ──────────────────────────────────────────
const box = await page.evaluate(() => ({
  s1: [...document.querySelectorAll('#box-step1-list input')].map(i => i.value),
  s2: [...document.querySelectorAll('#box-step2-list input')].map(i => i.value),
  s3: [...document.querySelectorAll('#box-step3-list input')].map(i => i.value),
  kp: [...document.querySelectorAll('#box-keypoints-list input')].map(i => i.value),
}));
eq('Box Step 1 defaults', box.s1, ['TAC Pts in SEC', 'Build FLT plan', 'Fix times']);
eq('Box Step 2 defaults', box.s2, ['LZ Ldg/TO Told', 'Add BULL', 'Build Orbit at JUNVA (1.3 legs 9+30 push)']);
eq('Box Step 3 default', box.s3, ['Set LL overfly points']);
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
ok('Persist: MIN FLAP default + the typed note', notesAfter.length === 2 && notesAfter[notesAfter.length - 1] === 'Weather check\nLine 2');
ok('Persist: After Takeoff checkbox stays checked',
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.chk-title')].find(x => x.textContent.includes('After Takeoff'));
    return t && t.querySelector('.chk-input').checked;
  }));
// Footer shows the master-file build stamp (Zulu), unchanged by user edits.
ok('Footer: master-file build stamp (Zulu)',
  /^\d{2} \w{3} \d{4} · \d{4}Z$/.test(await page.$eval('#mdc-last-updated', e => e.textContent.trim())));

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
eq('Reset: Callsign default', await page.$eval('#hdr-callsign', e => e.value), 'CADDO 96');
eq('Reset: ARCT back to default 1700', await page.$eval('#soe-arct',    e => e.value), '1700');
eq('Reset: AREX back to default 1835', await page.$eval('#soe-arex',    e => e.value), '1835');
eq('Reset: LL Entry back to 1900',     await page.$eval('#soe-llentry', e => e.value), '1900');
eq('Reset: SCLZ TOT back to 1914',     await page.$eval('#soe-lztime',  e => e.value), '1914');
eq('Reset: LL Exit back to 1934',      await page.$eval('#soe-llexit',  e => e.value), '1934');
eq('Reset: STLZ TOT back to 1931',     await page.$eval('#soe-lz2tot',  e => e.value), '1931');
eq('Reset: Takeoff back to 1415',      await page.$eval('#soe-takeoff', e => e.value), '1415');
const patReset = await page.$$eval('#pattern-list [data-preset]', els => els.map(e => e.getAttribute('data-preset')));
eq('Reset: Pattern Work empty', patReset, []);
eq('Reset: Slow 1 offset default', await page.$eval('#ll-slow-offset',  e => e.value), '120');
eq('Reset: Slow 2 offset default', await page.$eval('#ll-slow2-offset', e => e.value), '120');

// ── 17. Route Data SVGs + dynamic titles ────────────────────────────
await clickTab('Low Level');
// After Reset the route defaults to IR-154 (route data shown). NA shows no
// route SVG; then walk through the other routes.
eq('Route Data default IR-154', await page.$eval('#route-select', e => e.value), 'IR-154');
ok('IR-154 shows a route SVG by default', await page.evaluate(() => document.querySelector('#route-svg svg') !== null));
await page.selectOption('#route-select', 'NA');
await page.waitForTimeout(150);
ok('NA shows no route SVG', await page.evaluate(() => document.querySelector('#route-svg svg') === null));
await page.selectOption('#route-select', 'IR-154');
await page.waitForTimeout(150);
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
// IR-155 Turn Points (16 points B…N).
await page.selectOption('#route-select', 'IR-155');
await page.waitForTimeout(150);
const rows155 = await page.$$eval('#route-data-body tr', trs =>
  trs.map(t => [...t.querySelectorAll('td')].map(c => c.textContent.trim())));
eq('IR-155 Turn Points row count', rows155.length, 16);
eq('IR-155 first turn row', rows155[0], ['B','026','3998M','3812M','3547M','4400M']);
eq('IR-155 last turn row', rows155[15], ['N','227','4276M','4276M','3813M','4800M']);

// ── 18b. Route Information: Required Chart row ──────────────────────
const reqChart = await page.evaluate(() => {
  const r = [...document.querySelectorAll('#tab-llgk table tr')]
    .find(tr => tr.querySelector('td') && tr.querySelector('td').textContent.trim() === 'Required Chart Info');
  return r ? r.querySelectorAll('td')[1].textContent.trim() : null;
});
eq('Route Information has Required Chart Info row', reqChart,
   'Turn points, Initial Point (IP), objective area, course line, navigation information, VVOD data and date, ERAA, and chart series/date.');

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
eq('Downloaded copy retains toolbar', dlBtns, ['Print', 'Download', 'Save Data', 'Load Data', 'Reset']);
await dlPage.close();
fs.unlinkSync(downloadOut);

// ── 24. Defensive: removing per-button onclick still allows × ───────
await clickTab('Brief');
// Seed a couple of pattern rows (list is empty after the earlier Reset).
for (const v of ['DUKE TAC 6500', 'DUKE BEAM']) {
  await page.selectOption('#pattern-select', v);
  await page.click('button[onclick="addPatternItem()"]');
}
await page.waitForTimeout(120);
await page.evaluate(() =>
  document.querySelectorAll('#pattern-list [data-preset] button').forEach(b => b.onclick = null));
const beforeDel = await page.$$eval('#pattern-list [data-preset]', els => els.length);
await page.click('#pattern-list [data-preset]:first-child button');
await page.waitForTimeout(200);
const afterDel = await page.$$eval('#pattern-list [data-preset]', els => els.length);
ok('Delegated × handler removes pattern row even without per-button onclick',
  afterDel === beforeDel - 1);

// ── 25. Legacy AR197 → AR197H migration ───────────────────────────
await freshLoad();
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

// ── 25d. IR-155 Threat Plot card (Scenario tab, under Notional Weather) ──
ok('IR-155 Threat Plot card title present',
   /IR-155 Threat Plot/.test(await page.$eval('#ir155-threat-plot-card .card-header', e => e.textContent.replace(/\s+/g, ' ').trim())));
ok('IR-154 Threat Plot sits right after Notional LZ Weather',
   await page.evaluate(() => document.getElementById('notion-weather-card').nextElementSibling.id === 'ir154-threat-plot-card'));
const threat155 = await page.$$eval('#ir155-threat-plot-card tbody .threat-row',
  els => els.map(r => [...r.querySelectorAll('td')].map(t => t.textContent.trim())));
eq('IR-155 Threat Plot has 6 rows', threat155.length, 6);
eq('IR-155 BULL row', threat155[0],
   ['BULL', 'LBB/R062129', 'N 34 17 43.0', 'W 099 32 37.8']);
eq('IR-155 TH3 row', threat155[3],
   ['TH3', 'LBB/R009090', 'N 35 07 00.2', 'W 101 18 13.6']);
eq('IR-155 TH5 row', threat155[5],
   ['TH5', 'LBB/R018089', 'N 35 00 36.5', 'W 101 03 02.0']);

// ── 26. Ground Ops stale-state self-heal (drops unknown, keeps duplicates) ──
await page.evaluate(() => {
  localStorage.setItem('iprq-bros-mdc-v1', JSON.stringify({
    groundOps: ['Backing', 'Backing', 'Star Turn', 'NOPE', 'Star Turn', 'Backing']
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const healedGops = await page.$$eval('#ground-ops-list > div', els =>
  els.map(r => r.querySelector('span')?.textContent.trim()).filter(Boolean));
eq('Stale Ground Ops drops unknown but keeps duplicates on load',
   healedGops, ['Backing', 'Backing', 'Star Turn', 'Star Turn', 'Backing']);

// ── 26b. Save Card exports the full state as a JSON file ────────────
const [cardDownload] = await Promise.all([
  page.waitForEvent('download'),
  page.evaluate(() => saveCard()),
]);
const exported = JSON.parse(fs.readFileSync(await cardDownload.path(), 'utf8'));
ok('Save Card exports a wrapped state object',
   exported && exported._type === 'iprq-bros-mdc' && exported.state && typeof exported.state.inputs === 'object');
eq('Save Card captures the current callsign',
   exported.state.inputs['hdr-callsign'], await page.$eval('#hdr-callsign', e => e.value));
ok('Save Card filename includes "MDC"', /MDC/.test(cardDownload.suggestedFilename()));

// ── 26c. Load Card imports state from a file and reloads ───────────
const cardPath = path.join(__dirname, 'tmp-load-test.json');
fs.writeFileSync(cardPath, JSON.stringify({
  _type: 'iprq-bros-mdc', _v: 1,
  state: { inputs: { 'hdr-callsign': 'LOADED 42', 'hdr-flt': 'IPRQ FLT TEST' }, checkboxes: {} }
}));
await page.setInputFiles('#load-card-input', cardPath);
await page.waitForTimeout(900); // FileReader + location.reload()
await page.waitForLoadState('networkidle');
eq('Load Card applied imported callsign', await page.$eval('#hdr-callsign', e => e.value), 'LOADED 42');
eq('Load Card applied imported flight',   await page.$eval('#hdr-flt', e => e.value), 'IPRQ FLT TEST');
fs.unlinkSync(cardPath);
// Loading a non-card JSON is rejected (callsign stays as just-loaded value).
fs.writeFileSync(cardPath, JSON.stringify({ hello: 'world' }));
await page.setInputFiles('#load-card-input', cardPath);
await page.waitForTimeout(400);
eq('Load Card rejects a non-card file (no reload)',
   await page.$eval('#hdr-callsign', e => e.value), 'LOADED 42');
fs.unlinkSync(cardPath);

// ── 26d. Active tab persists across reload ─────────────────────────
await clickTab('GK');
await page.waitForTimeout(150);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
ok('Active tab (GK) restored after reload',
   await page.evaluate(() => document.getElementById('tab-lifesupport').classList.contains('active')));
// Memory items (QRC listed) render as emergency callouts with a warning icon.
eq('Memory items: 3 emergency callouts',
   await page.$$eval('#tab-lifesupport .mem-item', els => els.length), 3);
eq('Memory items: each callout has a warning icon',
   await page.$$eval('#tab-lifesupport .mem-item .mem-icon', els => els.length), 3);
eq('Memory items: 2 indented sub-items',
   await page.$$eval('#tab-lifesupport .mem-sub', els => els.length), 2);
ok('Memory items: first callout is Loss of Pressurization',
   await page.$eval('#tab-lifesupport .mem-item', el => el.textContent.includes('Loss of Pressurization')));

// ── 26e. Undo restores the card after Reset ────────────────────────
await clickTab('Brief');
await page.waitForTimeout(100);
await page.fill('#hdr-callsign', 'UNDOTEST 1');
await page.waitForTimeout(200);
await page.click('button[onclick="resetCard()"]');
await page.waitForTimeout(700);
eq('Reset cleared the callsign to default', await page.$eval('#hdr-callsign', e => e.value), 'CADDO 96');
ok('Undo bar appears after Reset',
   await page.evaluate(() => !!document.querySelector('button') &&
     [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Undo')));
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Undo').click());
await page.waitForTimeout(700);
eq('Undo restored the pre-Reset callsign', await page.$eval('#hdr-callsign', e => e.value), 'UNDOTEST 1');

// ── 26f. Print: per-tab page headers + pagination ──────────────────
await page.emulateMedia({ media: 'print' });
await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
await page.waitForTimeout(100);
const pHdrs = await page.$$eval('.print-tab-header',
  els => els.map(e => ({ text: e.textContent.trim(), shown: getComputedStyle(e).display !== 'none' })));
eq('Print: a header for each of the 6 tabs', pHdrs.length, 6);
ok('Print: headers visible under print media', pHdrs.every(h => h.shown));
const liveCs = await page.$eval('#hdr-callsign', e => e.value);
ok('Print: Brief header shows callsign + tab name',
   pHdrs.some(h => h.text.includes('Brief') && h.text.includes(liveCs)));
ok('Print: each tab panel breaks to a new page',
   await page.evaluate(() => getComputedStyle(document.getElementById('tab-msn')).breakBefore === 'page'));
await page.emulateMedia({ media: 'screen' });
ok('Print: headers hidden on screen',
   await page.$$eval('.print-tab-header', els => els.every(e => getComputedStyle(e).display === 'none')));

// ── 26f-2. "Print Tab" prints only the active tab ──────────────────
await clickTab('GK');
await page.waitForTimeout(120);
await page.emulateMedia({ media: 'print' });
await page.evaluate(() => document.body.classList.add('print-active-only'));
await page.waitForTimeout(80);
ok('Print Tab: active tab (GK) stays visible',
   await page.evaluate(() => getComputedStyle(document.getElementById('tab-lifesupport')).display !== 'none'));
ok('Print Tab: other tabs hidden',
   await page.evaluate(() => getComputedStyle(document.getElementById('tab-main')).display === 'none'));
ok('Print Tab: active tab has no leading page break',
   await page.evaluate(() => getComputedStyle(document.getElementById('tab-lifesupport')).breakBefore === 'avoid'));
await page.evaluate(() => document.body.classList.remove('print-active-only'));
await page.emulateMedia({ media: 'screen' });
await clickTab('Brief');

// ── 26g. Versioned defaults banner (Apply keeps user content) ──────
await page.evaluate(() => {
  localStorage.setItem('iprq-bros-mdc-v1', JSON.stringify({
    inputs: { 'hdr-callsign': 'OLDVER 9' }, checkboxes: {},
    notes: ['MY CUSTOM NOTE'], defaultsVersion: 0
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
ok('Defaults banner shows for an outdated card',
   await page.evaluate(() => !!document.getElementById('mdc-defaults-banner')));
eq('Outdated card loads its saved callsign', await page.$eval('#hdr-callsign', e => e.value), 'OLDVER 9');
await page.evaluate(() =>
  [...document.querySelectorAll('#mdc-defaults-banner button')].find(b => b.textContent.trim() === 'Apply').click());
await page.waitForTimeout(300);
eq('Apply resets callsign to the current default', await page.$eval('#hdr-callsign', e => e.value), 'CADDO 96');
ok('Apply preserves the user note',
   (await page.$$eval('#notes-list .note-input', els => els.map(e => e.value))).includes('MY CUSTOM NOTE'));
ok('Banner removed after Apply', await page.evaluate(() => !document.getElementById('mdc-defaults-banner')));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
ok('No banner after Apply stamps the version',
   await page.evaluate(() => !document.getElementById('mdc-defaults-banner')));

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
