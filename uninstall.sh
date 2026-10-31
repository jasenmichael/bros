#!/usr/bin/env bash
# Product uninstall. Lives in the release root next to the bros binary.
# Usage:
#   $BROS_DIR/uninstall.sh
#   $BROS_DIR/uninstall.sh --purge
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN="$ROOT/bros"
[[ -x "$BIN" ]] || {
  printf 'bros uninstall: error: missing %s\n' "$BIN" >&2
  exit 1
}
exec "$BIN" uninstall "$@"
