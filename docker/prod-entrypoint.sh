#!/bin/sh
# Nitro reads PORT and HOST. BROS_PORT is the app port. The process binds
# 0.0.0.0 so Docker's published port reaches this container. BROS_HOST is the
# address on the host machine, not this socket.
set -e
export PORT="${BROS_PORT:-3055}"
export HOST=0.0.0.0
exec node /app/src/app/.output/server/index.mjs
