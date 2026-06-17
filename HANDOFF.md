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

**Defaults versioning (`MDC_DEFAULTS_VERSION`):** saved cards stamp the
version they were built on. When you change a baked-in default, **bump
`MDC_DEFAULTS_VERSION`** — older saved cards then show an "Updated brief
data available · Apply/Dismiss" banner. **Apply** (`applyLatestDefaults`)
resets every `id`'d input/select to its HTML default (`defaultValue` /
`defaultSelected`) and re-runs the calculators, while leaving the dynamic
lists (no `id`) and checkboxes untouched; **Dismiss** just stamps the
current version. This is how a default correction reaches pilots who
already have saved state without wiping their edits.

**Toolbar:** Save Card / Load Card export & import the full state as JSON
(`saveCard` / `loadCard` / `_loadCardFile`). Reset and Load stash the
prior card for a one-tap **Undo** (`_mdcStashUndo` / `_mdcMaybeShowUndo`).
The active tab is remembered in `iprq-bros-mdc-tab`; print injects per-tab
headers via `_mdcPrintHeaders` on `beforeprint`. `type=file` inputs are
excluded from gather/restore.

## Key dynamic lists (and where each lives)

| Container ID                | Helper             | Save key in state    |
|-----------------------------|--------------------|----------------------|
| `#pattern-list`             | `addPatternItem` / `addCustomPatternItem` | `state.pattern` (mixed strings + `{preset:'Custom', text}` objects) |
| `#ground-ops-list`          | `addGroundOp`      | `state.groundOps`    |
| `#ss-active-list`           | `addSafetyItem('active', v)`   | `state.ssActive`    |
| `#ss-incorporated-list`     | `addSafetyItem('incorporated', v)` | `state.ssIncorporated` |
| `#box-step1-list`..`#box-keypoints-list` | `addBoxStep(listId, v)` | `state.boxSteps[listId]` |
| `#notes-list`               | `addNote(v)`       | `state.notes`        |
| `.ll-list[data-ll-key=…]` (LL tab "Low level X Check" sections) | `addLLItem(key, v)` | `state.llItems[key]` |
| `#ll-entry-list` (Low Level Entry, per-route) | `addLLEntryRow(v)` / `renderLLEntry()` | `state.llEntry[route]` |

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

## Importer — REMOVED

The AMT/Schedule paste importer (button, `#import-modal`, `openImport` /
`applyImport` / `parseAMT` / `parseSchedule` / normalizers / `_setValue`)
was removed — it only served one base's workflow. The legacy
`AR197 → AR197H` migration in `mdcRestore` is unrelated and stays. If a
PDF/schedule import is ever wanted again, recover it from git history
(pre-removal tip).

## Current defaults (Rec Ride)

- Header badge `Rec Ride` (editable `#hdr-flt`), callsign `NOGS 34`, students `DEAD` / `DUFF`
- SOE: Takeoff `0135`, LL Entry `0410`, LL Exit `0454`, ARCT `0205`, AREX `0340`
- **Low Level** card (titled "Low Level"; was "Low Level Info"): route
  **defaults to `IR-155`** (both synced route dropdowns) — so `#ll-info-table`
  is shown on a fresh card (Entry Pt `A`, Exit Pt `N`). Selecting `NA` hides
  the table and empties the LL-tab Low Level Entry list. Slow 1/Slow 2 default
  offset `−2:00` (value 120).
  - **Per-route LZ TOT rows** (`LL_LZ_CONFIG`): each route names its two LZ
    TOTs (rows below Slow 1 / Slow 2) and either *auto-derives* the time from
    LL Entry (`derive: N` minutes, read-only) or seeds an *editable* default
    (`value: 'HHMM'`). Slow 1/Slow 2 always = that TOT − the adjacent offset.
    Routes with no config hide the LZ + Slow rows.
    - `IR-154`: `SCLZ TOT` = LL Entry + 14, `STLZ TOT` = LL Entry + 31 (derived, read-only).
    - `IR-155`: `GDLZ TOT` `0429`, `SMLZ TOT` `0446` (editable defaults).
    - Editable values are remembered per route in `LL_LZ_STATE` (persisted as
      `state.llLz`); `_llLzRoute` tracks which route owns the inputs so a
      capture-phase save mid-switch can't pollute another route's memory.
- **Air Refueling** card (titled "Air Refueling"; was "AR Info"): track
  `AR312L`, Tanker `NITRO 73`, TNKR Type `KC-135`, RZ Type `G (Enroute)`,
  AR SPD `265 (KC-135)`. The track dropdown also has an **`NA`** option —
  when selected `#ar-info-table` is hidden (handled in `setARTrack`).
  **AR SPD is derived from TNKR Type** (`syncARSpeed()`): KC-135 → `265`,
  KC-46 → `275`. `#ar-spd-select` is display-only (`pointer-events:none`);
  it re-derives on TNKR change, init, restore, and Apply.
- Pattern Work: DUKE TAC 6500, DUKE BEAM, DUKE ACCEL 6500, STR IN
- Ground Ops: Backing, Star Turn
- Briefings / Notes: 3 pre-loaded (DEAD / DUFF seat-swap plan, MIN FLAP Emphasis)
- Box Setup Sequence: Step 1 (3), Step 2 (3), Step 3 (empty),
  Box Notes (2)
- Safety Supplements Active: `1SS-326 -> MGPS & P-RAIM Induce Date Reversion`
- Safety Supplements Incorporated: SS-325, SS-324, OP SUP 1S-323, SS-322
- FCIF: `26-22B - C-17 Pubs Release`; SII: `none active`
- EFB: Baseline `26-04 (23 Apr 26)`, iOS `26.5 CAO 27 May 26`,
  Pub Sync `26 May 2026`, FLIP `06-11-2026 thru 07-08-2026`
- Route of Flight:
  `KLTS ROCKN3.BFV MMB213050 AR312 PUB183022 AR312 MMB213050 FLOYD LBB106039 IR154 PNH123051 DOGIN ZOCKS KLTS`

## Low level X Check (LL tab) — editable + route-aware

Every section in the "Low level X Check" card (Descent Check, Combat
Entry, Route Activation, PFARTSS, Approach Check, Low Level Entry,
Scenario Objectives, LZ Check-In, Combat Exit) is now an **editable
list** (`.ll-list[data-ll-key]` container + `+ item` button, rows are
`textarea.ll-input` with an `×`). Section titles + checkboxes are fixed;
only the items are editable. Generic sections persist via
`state.llItems[key]` (gathered straight from the DOM like the SS lists).

**Nesting (sub-items).** Each row can be a top-level item or an indented
sub-item, toggled by the per-row `⇥`/`⇤` button (`.ll-indent`, drives the
`data-sub` attribute + CSS). A row value is a plain **string** for
top-level or `{ text, sub:true }` for a sub-item — see `_llNormalize` /
`_llRowValue` / `_llHasText`. Defaults that ship nested: Route Activation
auth codes, Scenario Objectives lines, LZ Check-In "Clb left turn"/
"4500'". Old saved state (all strings) restores as flat — reset to pick
up the nested defaults.

**Low Level Entry is special — route-dependent.** It follows the
**Brief tab** `#ll-route-select` ("Low Level Info"). The two low-level
route dropdowns — `#ll-route-select` and the LL-tab `#route-select`
(Route Data) — are kept **in sync** by `syncLLRoute(source)` (both
`onchange` handlers; Low Level Info wins on restore). Changing either
updates both, runs `setLLRoute()` (entry/exit pts, SCLZ/STLZ,
`renderLLEntry()`) and `renderRouteData()`.
Per-route item lists live in `LL_ENTRY_STATE[route]` (persisted as
`state.llEntry`). Defaults: `llEntryDefaultFor(route)` =
`LL_ENTRY_ROUTE_TOP[route]` (IR-154 gets the "Maintain 4500-10,000…"
line) + `LL_ENTRY_COMMON` (the freq line + Hack/Squawk/Talk + Speed
Limits + Set Escape freq — shared default for every route). Edits are
remembered per route. The `#ll-entry-fixes` line (auto-calculated
A/F/J from SOE LL Entry) is **locked / not editable** and shown only for
IR-154 (toggled in `renderLLEntry`).

`resizeLLInputs()` re-grows the auto-sizing textareas; it's called from
`switchTab('llgk')` because textareas render at 0 height while the tab
is hidden.

## Pitfalls / gotchas

- **`soe-lztime` and `soe-lz2tot` live on the Low Level Info card**,
  not on SOE. They keep the `soe-` prefix for historical reasons (and
  to preserve persisted state) but were moved into the LL Info table
  rows labelled **SCLZ TOT** and **STLZ TOT**, which are shown / hidden
  by `setLLRoute()` based on whether IR-154 is the selected route.
  Don't be tempted to rename the IDs to match the label — that breaks
  persistence and the Slow 1 / Slow 2 calc wiring.
  **These are now read-only / auto-calculated**: `syncLowLevel()` sets
  `soe-lztime` = LL Entry (`soe-llentry`) + 14 min and `soe-lz2tot` =
  LL Entry + 31 min, then feeds them into the Slow 1 / Slow 2 calc.
  They are no longer user-editable (no `oninput`). The importer still
  `_setValue`s them, but schedule data is internally consistent
  (SCLZ = entry+14, STLZ = entry+31) so derived and imported agree.
  The LL tab's `#ll-fix-a/f/j` line (A = entry, F = +19, J = +34) is
  computed in the same function.
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
7. **IPRQ FLT 2 defaults refresh** (`1cdc142`)
8. **Editable + route-aware Low Level X Check, NA option, per-route LL
   Entry, auto-derived SCLZ/STLZ, synced route dropdowns** (cont branch)
9. **IPRQ FLT 3 config** — NOGS 96, Takeoff 0130, AR197L / DASH 95 /
   D (Pt Parallel) / 275 (KC-46), blank LL Entry, editable badge
10. **SessionStart hook** provisions Playwright Chromium from GCS so the
    suite runs on the web (`.claude/hooks/session-start.sh`)

The single source of truth for the current flight config is the
**Current defaults (IPRQ FLT 3)** section above — update it whenever a
default changes.

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
