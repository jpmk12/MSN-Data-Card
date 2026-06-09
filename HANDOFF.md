# IPRQ-BROS-MDC — Handoff Notes

## What this project is

A single-file static web app (`IP_REQUAL_BROS__Mission_Check.html`) that pilots
fill in as a pre-flight mission data card on iPad / Chrome / Edge. Self-contained,
offline-only, strict CSP — no external resources at runtime. The card has six
tabs (Brief, AR, Low Level, Tactical, GK, Scenario) plus a sticky-ish toolbar.

## Repo layout

```
/IP_REQUAL_BROS__Mission_Check.html   ← the whole app (HTML + CSS + JS in one file)
/tests/regression.mjs                 ← Playwright suite (110 checks)
/.gitignore                           ← node_modules, tmp-downloaded.html
```

Branch: `claude/mission-data-card-jRcCY`. Every change has been
committed and pushed to that branch.

## How to run

**Local preview**:
```bash
python3 -m http.server 8000
# open http://127.0.0.1:8000/IP_REQUAL_BROS__Mission_Check.html
```

**Regression tests** (requires Playwright):
```bash
python3 -m http.server 8000 &
npm i playwright
npx playwright install chromium
node tests/regression.mjs
```
`BASE_URL=...` env var overrides the URL (use to test a downloaded file
via `file://`). Current state: **110/110 passing**.

## Persistence model

All editable state lives in `localStorage` under the key
`iprq-bros-mdc-v1`. The page bootstraps in this order during
`DOMContentLoaded`:

1. Init helpers fire: `soeCalc()`, `syncARCT()`, `syncLowLevel()`,
   `setARTrack()`, `setLLRoute()`, `renderRouteData()`, etc.
2. Defaults are pre-loaded: Pattern Work, Ground Ops, Safety Supplements
   (Incorporated), Box Setup Sequence, Briefings / Notes.
3. `mdcRestore()` reads localStorage and **replays** saved state on top.
   This includes a legacy migration block (currently handles
   `efb-ioi → efb-ios` and `ar-track-select: 'AR197' → 'AR197H'`).
4. **Defensive cleanups** run for SS lists, Pattern Work, Ground Ops
   (drop empties / unknowns / duplicates).
5. `_mdcReady` flips to `true` and the `input` / `change` capture-phase
   listeners get attached so future user edits persist automatically.

Important: **`mdcPersist()` is a no-op while `_mdcReady === false`**, so
init defaults don't clobber saved state. Any new dynamic list helper
should respect this pattern — call `mdcPersist()` at the end and rely
on the gate.

## Key dynamic lists (and where each lives)

| Container ID                | Helper             | Save key in state    |
|-----------------------------|--------------------|----------------------|
| `#pattern-list`             | `addPatternItem` / `addCustomPatternItem` | `state.pattern` (mixed strings + `{preset:'Custom', text}` objects) |
| `#ground-ops-list`          | `addGroundOp`      | `state.groundOps`    |
| `#ss-active-list`           | `addSafetyItem('active', v)`   | `state.ssActive`    |
| `#ss-incorporated-list`     | `addSafetyItem('incorporated', v)` | `state.ssIncorporated` |
| `#box-step1-list`..`#box-keypoints-list` | `addBoxStep(listId, v)` | `state.boxSteps[listId]` |
| `#notes-list`               | `addNote(v)`       | `state.notes`        |

Each helper creates a row with an `×` button. Pattern Work also has a
delegated `click` handler on `#pattern-list` as a defense if the
per-button `onclick` ever stops firing.

`saveCurrentRoute()` is the Route of Flight "Save" button — it stashes
into `CUSTOM_ROUTES` and re-renders a `<optgroup label="Custom">` in
`#rof-preset`. Auto-names entries `Custom N`.

## Routes / SVGs / Schedule data

- `ROUTE_PRESETS` — MOTA + procedure preset routes used by `applyRoutePreset(mode)`.
- `AR_TRACKS` — freqs/TACAN/block for AR197H, AR197L, AR312H, AR312L.
- `LL_PRESETS` — Entry/Exit Pt letters for IR-154, IR-155, etc.
- `IR154_SVG`, `IR155_SVG`, `IR193_VR106_SVG` — string-literal SVGs
  rendered via `ROUTE_SVGS[selected]()` in `renderRouteData()`.
  `IR-193` and `VR-106` share the same SVG with a title swap.
- `setLLRoute()` toggles visibility of `#ll-sclz-row` and `#ll-stlz-row`
  (only shown when IR-154 is selected).

## Importer (Toolbar → Import button)

`openImport()` / `closeImport()` show / hide `#import-modal`.
`applyImport()` parses two textareas:

- **AMT**: `parseAMT(text, callsign)` tries two layouts —
  1. Inline (callsign and data on one line, layout-preserved spaces)
  2. Column-split (data rows separately, callsign list at the bottom,
     matched by index). Acrobat / Preview copy-paste produces this.
- **Schedule**: `parseSchedule(text, callsign)` finds the `CALLSIGN:`
  block for the target and pulls TO(Z), AR TRACK, RZ TYPE, ARCT, AREX,
  TNKR C/S, TNKR TYPE via field-specific regexes that stop at 2+ spaces
  (the column separator in PDF text).

Normalizers: `_hhmm`, `_normRoute` (adds the hyphen `IR154 → IR-154`),
`_normArTrack` (exact match first, then strips trailing H/L as a
fallback), `_normRzType`, `_normCallsign`.

`_setValue(id, value, eventName)` writes to the target field AND
dispatches the matching event so downstream side effects (`syncLowLevel`,
`setARTrack`, etc.) fire.

## Current defaults (as of last commit `1cdc142` — IPRQ FLT 2)

- Header badge `IPRQ FLT 2`, callsign `CADDO 10`, students `DEAD` / `DUFF`
- SOE: Takeoff `1415`, LL Entry `1900`, LL Exit `1934`, ARCT `1700`, AREX `1835`
- LL Info: route `IR-154`, Entry Pt `A`, Exit Pt `J`, SCLZ TOT `1914`,
  STLZ TOT `1931`, Slow 1/Slow 2 default offset `−2:00` (value 120)
- AR Info: track `AR197L`, Tanker `DASH 85`, TNKR Type `KC-46`,
  RZ Type `G (Enroute)`, AR SPD `265 (135)`
- Pattern Work: DUKE TAC 6500, DUKE BEAM, DUKE ACCEL 6500, STR IN
- Ground Ops: Backing, Star Turn
- Briefings / Notes: two pre-loaded (DUFF / DEAD assignments)
- Box Setup Sequence: Step 1 (3), Step 2 (2), Step 3 (empty),
  Box Notes (2)
- Safety Supplements Incorporated: SS-325, SS-324, OP SUP 1S-323, SS-322
- FCIF: `26-22B - C-17 Pubs Release`; SII: `none active`
- EFB: Baseline `26-04 (23 Apr 26)`, iOS `26.5 CAO 12 May 26`,
  Pub Sync `26 May 2026`, FLIP `05/14/2026 thru 06/10/2026`
- Route of Flight:
  `KLTS ROCKN3.BFV MMB213050 AR312 PUB183022 AR312 MMB213050 FLOYD LBB106039 IR154 PNH123051 DOGIN ZOCKS KLTS`

## Pitfalls / gotchas

- **`soe-lztime` and `soe-lz2tot` live on the Low Level Info card**,
  not on SOE. They keep the `soe-` prefix for historical reasons (and
  to preserve persisted state) but were moved into the LL Info table
  rows labelled **SCLZ TOT** and **STLZ TOT**, which are shown / hidden
  by `setLLRoute()` based on whether IR-154 is the selected route.
  Don't be tempted to rename the IDs to match the label — that breaks
  persistence and the Slow 1 / Slow 2 calc wiring.
- **Don't change input IDs** unless you also add a legacy migration in
  `mdcRestore`. The user has saved state in production. The pattern is:
  ```js
  if (state.inputs['old-id'] && !state.inputs['new-id']) {
    state.inputs['new-id'] = state.inputs['old-id'];
  }
  ```
- **Toolbar Reset is confirm-less** by design (their browser blocks popups).
  Don't add `confirm()`. Same goes for `prompt()` — `saveCurrentRoute`
  auto-names with `Custom N`.
- **Downloaded HTML must retain the toolbar.** `downloadHTML()` no longer
  strips it (only removes the *Print/Download* via a class would break
  Reset; we removed that strip).
- **CSP is strict** (`default-src 'none'` etc.) — adding any external
  resource (CDN, fonts, etc.) would require relaxing it. Inline-only.
- **`pdf.js` is NOT bundled.** Importer is paste-text only. If the user
  later needs PDF upload, expect ~1 MB inlined and a CSP relax for the
  worker.
- **Tests are order-sensitive.** Several tests reload the page mid-suite
  expecting prior edits to persist. Any new test that calls
  `localStorage.setItem(...)` mid-suite will wipe those edits. Put such
  tests at the end (after `// ── 26.` or wherever the persistence
  re-checks end).
- The `addPatternItem` Custom branch calls `addCustomPatternItem(value)`
  with `value` always present after restore (so `input.focus()` isn't
  triggered there).

## Recent rough patches of changes

1. **Importer + TNKR Type** (commit `e26efe9`, `bf27feb` for column-split)
2. **AR197 split into AR197H/L** (`30d1f0b`) — `AR_TRACKS` data + legacy migration
3. **Briefings/Notes defaults DUFF/DEAD** (`45f8523`)
4. **Slow row split / SCLZ/STLZ moved to LL Info** (`567d3c2` and `bb1dc89`)
5. **Ground Ops self-heal** (`4ec7b7c`)
6. **Slow 1/Slow 2 red highlight** (`6ef1aba`)
7. **IPRQ FLT 2 defaults refresh** (`1cdc142` — current tip)

## Open items / nice-to-haves the user mentioned

- AR197H/L freqs were given as `264.9 | 236.650` for AR197L. Current
  `AR_TRACKS` reflects `264.900 | 236.650`. If a future update changes
  AR197H freqs, edit `AR_TRACKS` AND ensure freqs cell mapping stays.
- User has not asked for PDF.js upload yet — keep the paste-text path
  unless they ask.
- Persistence migration block in `mdcRestore` is the right place for
  any future ID renames.

## Working style the user prefers

- **Action-oriented.** Make the change, run tests, push, briefly
  describe what landed and any caveats. Don't ask if not necessary.
- **Tests gated.** Update `tests/regression.mjs` for any behavior change
  (default, new field, new flow) and confirm `N/N passing` in the reply.
- **Single commit per request** is fine; use a descriptive message and
  end with the `https://claude.ai/code/session_…` line.
- **Screenshots** with `SendUserFile` after meaningful visual changes.

## Quick file orientation (line ranges are approximate)

- `<style>` block: top of file, ~5–400
- Toolbar + import modal: ~395–460
- Callsign bar / header: ~430–480
- `#tab-main` content (Brief tab): ~485–~810
- Other tabs (`#tab-llgk`, `#tab-msn`, `#tab-tacgk`, `#tab-scenario`,
  Life Support tab `#tab-lifesupport`): scattered between ~860–~2200
- First `<script>` block (most logic): ~2600 onward
- Persistence (`mdcRestore`, `mdcGatherState`, `mdcPersist`): ~4000–~4150
- DOMContentLoaded init: ~4180–~4310
- Second `<script>` (`switchTab`, `downloadHTML`, `resetCard`,
  `openImport`, `applyImport`, `parseAMT`, `parseSchedule`,
  importer helpers): ~4310 onward
