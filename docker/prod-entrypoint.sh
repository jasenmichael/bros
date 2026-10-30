#!/bin/sh
# Nitro reads PORT and HOST. BROS_HOST is the listen address (default 0.0.0.0).
set -e
export PATH="/app/data/home/.local/app-bins:${PATH}"
export PORT="${BROS_PORT:-3055}"
export HOST="${BROS_HOST:-0.0.0.0}"
exec node /app/src/ui/.output/server/index.mjs
