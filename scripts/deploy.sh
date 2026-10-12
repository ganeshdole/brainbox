#!/usr/bin/env bash
#
# Production deploy for brainbox — runs ON the EC2 box, invoked over SSH:
#
#   git show <sha>:scripts/deploy.sh | bash -s -- <sha>
#
# Deploys the backend (systemd), dashboard SPA, and widget bundle, runs DB
# migrations, and auto-rolls-back on a failed health check.
#
# SAFETY (this box is SHARED with other projects — 3pe1x, kritix, everyrank):
# every path/service touched below is brainbox-only. Never widen this.
#
# Migrations are FORWARD-ONLY: rollback restores code + static assets, NOT the
# schema. Keep every migration additive / backward-compatible (expand-contract)
# so the previous release still runs against the new schema.
set -euo pipefail

# --- config (brainbox-only) ---
REPO="/home/ubuntu/brainbox"
WEB="/var/www/brainbox-app"                 # dashboard SPA + widget.js (ubuntu-owned)
WWW="/var/www/brainbox-www"                 # marketing site (was Vercel)
PREV_WEB="/home/ubuntu/.brainbox-web-prev"  # static rollback snapshot (ubuntu home)
PREV_WWW="/home/ubuntu/.brainbox-www-prev"
SERVICE="brainbox-api.service"
HEALTH="http://localhost:8790/health"
# Non-interactive SSH shell doesn't source nvm — put node/pnpm on PATH explicitly.
export PATH="/home/ubuntu/.nvm/versions/node/v22.19.0/bin:$PATH"

TARGET_SHA="${1:-origin/main}"
cd "$REPO"
PREV_SHA="$(git rev-parse HEAD)"
echo ">> deploy $PREV_SHA -> $TARGET_SHA"

build_backend() { pnpm -F @brainbox-sh/backend build; }

publish_static() {
  # dashboard/dist has index.html + assets/ (NOT the widget). --exclude keeps the
  # existing widget files from being deleted, then we overwrite them explicitly.
  # widget-capture.js goes first: a widget.js that can't find it can't capture.
  rsync -a --delete --exclude widget.js --exclude widget-capture.js dashboard/dist/ "$WEB"/
  cp -f widget/dist/widget-capture.js "$WEB"/widget-capture.js
  cp -f widget/dist/widget.js "$WEB"/widget.js
  # Marketing, served from this box since we left Vercel. It loads the widget
  # from app.brainbox.sh, so it needs no widget.js of its own.
  mkdir -p "$WWW"
  rsync -a --delete marketing/dist/ "$WWW"/
}

health_ok() {
  for _ in 1 2 3 4 5 6; do
    if curl -fsS -m 10 "$HEALTH" >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

rollback() {
  echo "!! deploy failed — rolling back to $PREV_SHA"
  git checkout -f "$PREV_SHA"
  pnpm install --frozen-lockfile
  build_backend
  [ -d "$PREV_WEB" ] && rsync -a --delete "$PREV_WEB"/ "$WEB"/
  if [ -d "$PREV_WWW" ]; then rsync -a --delete "$PREV_WWW"/ "$WWW"/; fi
  sudo systemctl restart "$SERVICE"
  if health_ok; then echo "!! rolled back OK"; else echo "!! ROLLBACK ALSO UNHEALTHY — manual attention needed"; fi
  exit 1
}

# --- 1. fetch + checkout the exact commit CI verified ---
git fetch origin --prune --quiet
git checkout -f "$TARGET_SHA"

# --- 2. deps ---
pnpm install --frozen-lockfile

# --- 3. backup DB + storage BEFORE any migration (14-day retention) ---
bash backend/scripts/backup.sh

# --- 4. build all deployables ---
build_backend
pnpm -F @brainbox-sh/widget build
pnpm -F @brainbox-sh/dashboard build
pnpm -F brainbox-landing build

# --- 5. snapshot current static for rollback, then migrate ---
rm -rf "$PREV_WEB"; cp -a "$WEB" "$PREV_WEB"
# `[ -d ] && cp` would abort under `set -e` on the very first deploy, when the
# marketing webroot does not exist yet. An if-block is the safe form.
rm -rf "$PREV_WWW"
if [ -d "$WWW" ]; then cp -a "$WWW" "$PREV_WWW"; fi
pnpm -F @brainbox-sh/backend db:migrate || rollback

# --- 6. publish static + restart backend ---
publish_static
sudo systemctl restart "$SERVICE"

# --- 7. health-gated; auto-rollback on failure ---
if ! health_ok; then rollback; fi

rm -rf "$PREV_WEB" "$PREV_WWW"
echo ">> deploy OK: $(git rev-parse --short HEAD) live"
