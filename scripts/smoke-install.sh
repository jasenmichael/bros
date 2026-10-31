#!/usr/bin/env bash
# Entry for local install/uninstall smoke tests (skipped in GH CI).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/test/smoke/run.sh" "$@"
