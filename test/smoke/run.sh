#!/usr/bin/env bash
# Local-only install/uninstall smoke. Not run in GitHub Actions / test:ci.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib.sh
source "$ROOT/lib.sh"

need() { command -v "$1" >/dev/null 2>&1 || { echo "smoke: need $1" >&2; exit 1; }; }
need docker
need cargo
need pnpm
need curl
need python3

bash "$ROOT/cases.sh"
