#!/bin/sh
set -e
# Install and Nuxt must never run as root. Root writes make named volumes and
# bind-mounted .nuxt unusable by the desktop user (bros / PUID).
if [ "$(id -u)" -eq 0 ]; then
  echo "[bros] refuse: pnpm/UI as root. Run as desktop uid (PUID), not root." >&2
  exit 1
fi
export PATH="/app/data/home/.local/app-bins:${PATH}"
cd /app/src
# Named node_modules volumes start empty. One-off node processes
# share this path; serialize install only.
if [ ! -e node_modules/citty ]; then
  mkdir -p node_modules
  lock=node_modules/.bros-install.lock
  if ! ( umask 0077; touch "$lock" ) 2>/dev/null; then
    lock=/tmp/bros-pnpm-install.lock
    umask 0077
    touch "$lock"
  fi
  (
    flock 9
    if [ ! -e node_modules/citty ]; then
      echo "[bros] pnpm install…"
      CI=true pnpm install --filter "@bros/ui..." --no-frozen-lockfile
    fi
  ) 9>>"$lock"
fi
exec "$@"
