#!/bin/sh
set -e
cd /app/src
echo "[bros] pnpm install…"
CI=true pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0
exec "$@"
