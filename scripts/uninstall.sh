#!/usr/bin/env bash
# Product uninstall. Canonical source: scripts/uninstall.sh.
# Packaged at release root next to bros; install puts it in $BROS_DIR.
# Usage:
#   $BROS_DIR/uninstall.sh
#   $BROS_DIR/uninstall.sh --purge
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN="$ROOT/bros"
[[ -x "$BIN" ]] || {
  printf '[bros] error: missing %s\n' "$BIN" >&2
  exit 1
}
exec "$BIN" uninstall "$@"
