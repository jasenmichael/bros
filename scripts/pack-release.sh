#!/usr/bin/env bash
# Local release tree. Not a GitHub upload.
# Omits cli/ sources, data/, .git, node_modules, and .output.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
cargo build --release --manifest-path cli/Cargo.toml

stage="$(mktemp -d)"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT

copy() {
  mkdir -p "$stage/$(dirname "$1")"
  cp -a "$1" "$stage/$1"
}

cp -a cli/target/release/bros "$stage/bros"
chmod 755 "$stage/bros"
copy VERSION
copy docker-compose.yml
copy docker-compose.prod.yml
copy docker-compose.dev.yml
copy lib
copy docker
mkdir -p "$stage/docs"
cp -a docs/cli.md "$stage/docs/cli.md"
copy vendor/bros-model
mkdir -p "$stage/src"
tar -C src -cf - \
  --exclude node_modules \
  --exclude .output \
  --exclude .nuxt \
  . | tar -C "$stage/src" -xf -

# cli/ and data/ stay out of the tar.
test ! -e "$stage/cli"
test ! -e "$stage/data"
tar -C "$stage" -czf "$ROOT/bros.tar.gz" .
echo "wrote $ROOT/bros.tar.gz"
