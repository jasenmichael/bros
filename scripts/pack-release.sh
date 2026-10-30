#!/usr/bin/env bash
# Pack one release tarball. Does not bump VERSION and does not upload.
# The Nitro output and the bros binary must already be built.
#
#   pnpm --dir src --filter @bros/ui build
#   cargo build --release --manifest-path cli/Cargo.toml --target x86_64-unknown-linux-gnu
#   scripts/pack-release.sh --target x86_64-unknown-linux-gnu
#
#   scripts/pack-release.sh --binary path/to/bros --ui src/ui/.output --name bros-linux-amd64
#
# Writes <name>.tar.gz and <name>.tar.gz.sha256 in the repo root.
# The binary inside the tar is always named bros.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
orig="$(pwd)"

binary=""
target=""
ui="$ROOT/src/ui/.output"
name=""

die() {
  printf 'pack-release: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
usage: scripts/pack-release.sh [--binary PATH] [--target TRIPLE] [--ui DIR] [--name NAME]

--ui defaults to src/ui/.output. --name defaults from --target, else from uname.
Does not bump VERSION, cargo-build, or pnpm-build.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --binary)
      binary="${2:?}"
      shift 2
      ;;
    --target)
      target="${2:?}"
      shift 2
      ;;
    --ui)
      ui="${2:?}"
      shift 2
      ;;
    --name)
      name="${2:?}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

abs_path() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    *) printf '%s/%s' "$orig" "$1" ;;
  esac
}

asset_from_uname() {
  local os arch
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) die "unsupported OS: $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) die "unsupported arch: $(uname -m)" ;;
  esac
  printf 'bros-%s-%s' "$os" "$arch"
}

if [[ -n "$target" ]]; then
  case "$target" in
    x86_64-unknown-linux-gnu) target_name=bros-linux-amd64 ;;
    aarch64-unknown-linux-gnu) target_name=bros-linux-arm64 ;;
    x86_64-apple-darwin) target_name=bros-darwin-amd64 ;;
    aarch64-apple-darwin) target_name=bros-darwin-arm64 ;;
    *) die "unsupported target: $target" ;;
  esac
  if [[ -z "$binary" ]]; then
    binary="$ROOT/cli/target/$target/release/bros"
  fi
  if [[ -z "$name" ]]; then
    name="$target_name"
  fi
fi
if [[ -z "$binary" ]]; then
  binary="$ROOT/cli/target/release/bros"
fi
if [[ -z "$name" ]]; then
  name="$(asset_from_uname)"
fi
name="${name%.tar.gz}"

binary="$(abs_path "$binary")"
ui="$(abs_path "$ui")"

[[ -f "$binary" ]] || die "built CLI missing: $binary"
[[ -f "$ui/server/index.mjs" ]] || die "built UI missing: $ui/server/index.mjs (run: pnpm --dir src --filter @bros/ui build)"

cd "$ROOT"

stage="$(mktemp -d)"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT

copy() {
  mkdir -p "$stage/$(dirname "$1")"
  cp -a "$1" "$stage/$1"
}

install -m 755 "$binary" "$stage/bros"
copy VERSION
copy example.env
copy .dockerignore
copy lib
copy scripts/docker
mkdir -p "$stage/scripts"
cp -a scripts/bros-tunnel.sh scripts/bros-tunnel-helper.sh "$stage/scripts/"
mkdir -p "$stage/docs"
tar -C docs -cf - --exclude adr . | tar -C "$stage/docs" -xf -
mkdir -p "$stage/src/ui"
cp -a "$ui" "$stage/src/ui/.output"

# cli/ sources, data/, vendor/, src sources, and docs/adr stay out.
test ! -e "$stage/cli"
test ! -e "$stage/data"
test ! -e "$stage/vendor"
test ! -e "$stage/src/website"
test ! -e "$stage/src/server"
test ! -e "$stage/src/layers"
test ! -e "$stage/src/ui/nuxt.config.ts"
test ! -e "$stage/src/ui/package.json"
test ! -e "$stage/docs/adr"
test ! -e "$stage/scripts/pack-release.sh"
test -x "$stage/bros"
test -f "$stage/example.env"
test -f "$stage/VERSION"
test -f "$stage/lib/apps/core/ollama/BROS_MODEL_VERSION"
test ! -e "$stage/BROS_MODEL_VERSION"
test -f "$stage/.dockerignore"
test -f "$stage/src/ui/.output/server/index.mjs"
test -f "$stage/docs/cli.md"
test -f "$stage/scripts/bros-tunnel.sh"
test -f "$stage/lib/desktop/Dockerfile"
test -f "$stage/lib/desktop/docker-compose.yml"
test -f "$stage/lib/desktop/docker-compose.dev.yml"
test -f "$stage/lib/desktop/docker-compose.prod.yml"
test -f "$stage/scripts/docker/prod-entrypoint.sh"
test -f "$stage/scripts/docker/dev-entrypoint.sh"
test ! -e "$stage/docker-compose.yml"
test ! -e "$stage/docker"

archive="${name}.tar.gz"
tar -C "$stage" -czf "$ROOT/$archive" .
(
  cd "$ROOT"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$archive" > "${archive}.sha256"
  else
    shasum -a 256 "$archive" > "${archive}.sha256"
  fi
)
echo "wrote $ROOT/$archive"
