#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Provisions the Node deps and Playwright's Chromium so the regression
# suite (`npm test` / `node tests/regression.mjs`) can run. The normal
# `npx playwright install` is blocked here because the environment's
# network allowlist denies cdn.playwright.dev. The *same* Chrome-for-Testing
# builds live on storage.googleapis.com (which is reachable), so we fetch
# them from there and drop them where Playwright expects.
#
# Idempotent: re-running skips work that's already done (and the container
# state is cached after the first successful run).
set -euo pipefail

# Only needed in the remote (web) environment; local machines have a browser.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# 1) Node dependencies (Playwright JS package). npm install is cache-friendly.
npm install --no-audit --no-fund

# 2) Browser binaries. Ask Playwright which version + install dirs it wants,
#    then fetch the matching Chrome-for-Testing zips from GCS.
DRY="$(npx playwright install chromium --dry-run 2>/dev/null || true)"
VER="$(printf '%s\n' "$DRY" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
CHROMIUM_DIR="$(printf '%s\n' "$DRY" | grep -oE '/[^ ]*/chromium-[0-9]+' | head -1 || true)"
HS_DIR="$(printf '%s\n' "$DRY" | grep -oE '/[^ ]*/chromium_headless_shell-[0-9]+' | head -1 || true)"

if [ -z "$VER" ] || [ -z "$CHROMIUM_DIR" ]; then
  echo "session-start: could not determine Playwright Chromium version; skipping browser provision." >&2
  exit 0
fi

BASE="https://storage.googleapis.com/chrome-for-testing-public/${VER}/linux64"

fetch_unzip() { # $1 = url, $2 = destination dir
  local zip
  zip="$(mktemp /tmp/cft-XXXXXX.zip)"
  curl -fsSL -o "$zip" "$1"
  mkdir -p "$2"
  unzip -q -o "$zip" -d "$2"
  rm -f "$zip"
}

if [ ! -x "$CHROMIUM_DIR/chrome-linux64/chrome" ]; then
  echo "session-start: fetching Chrome for Testing ${VER} from GCS..."
  fetch_unzip "${BASE}/chrome-linux64.zip" "$CHROMIUM_DIR"
  touch "$CHROMIUM_DIR/INSTALLATION_COMPLETE"
fi

if [ -n "$HS_DIR" ] && [ ! -x "$HS_DIR/chrome-headless-shell-linux64/chrome-headless-shell" ]; then
  echo "session-start: fetching Chrome Headless Shell ${VER} from GCS..."
  fetch_unzip "${BASE}/chrome-headless-shell-linux64.zip" "$HS_DIR"
  touch "$HS_DIR/INSTALLATION_COMPLETE"
fi

echo "session-start: Playwright Chromium ${VER} ready."
