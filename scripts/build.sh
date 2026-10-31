#!/usr/bin/env bash
# Local checkout build: host CLI + UI, then repo-root ./bros symlink.
# Does not pack, tag, bump VERSION, or create ~/.local/bin/bros.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

die() {
  printf 'build: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' not found. Install it, then re-run."
}

need_cmd cargo
need_cmd pnpm

cargo build --release --manifest-path "$ROOT/cli/Cargo.toml"
pnpm --dir "$ROOT/app" --filter @bros/ui build

bin="$ROOT/cli/target/release/bros"
[[ -x "$bin" ]] || die "missing CLI binary at cli/target/release/bros"
ln -sfn cli/target/release/bros "$ROOT/bros"
printf 'build: ./bros ready\n'
