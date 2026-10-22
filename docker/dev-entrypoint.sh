#!/bin/sh
set -e
export PATH="/app/data/home/.local/sidecar-bins:${PATH}"
cd /app/src
if [ ! -e node_modules/citty ] && [ ! -e cli/node_modules/citty ]; then
  echo "[bros] pnpm install…"
  CI=true pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0
fi
exec "$@"
