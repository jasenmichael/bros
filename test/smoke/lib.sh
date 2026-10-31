#!/usr/bin/env bash
# Shared helpers for install/uninstall smoke tests.
set -euo pipefail

SMOKE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SMOKE_ROOT/../.." && pwd)"
CACHE_DIR="${BROS_SMOKE_CACHE:-$SMOKE_ROOT/cache}"
HOST_SMOKE="${BROS_SMOKE_HOST_ROOT:-/tmp/bros-smoke}"
# Name must NOT match `bros-*` — product `bros stop` kills that prefix via docker name filter.
CONTAINER_NAME="${BROS_SMOKE_CONTAINER:-smoke-bros}"
IMAGE_NAME="${BROS_SMOKE_IMAGE:-smoke-bros:local}"

pass=0
fail=0

say() { printf 'smoke: %s\n' "$*" >&2; }
fail_msg() { printf 'smoke: FAIL: %s\n' "$*" >&2; fail=$((fail + 1)); }
ok() { printf 'smoke: ok: %s\n' "$*" >&2; pass=$((pass + 1)); }

assert_eq() {
  local want="$1" got="$2" label="$3"
  if [[ "$want" == "$got" ]]; then
    ok "$label"
  else
    fail_msg "$label (want=$want got=$got)"
  fi
}

assert_file() {
  local path="$1" label="${2:-$1 exists}"
  if [[ -e "$path" ]]; then ok "$label"; else fail_msg "$label"; fi
}

assert_missing() {
  local path="$1" label="${2:-$1 gone}"
  if [[ ! -e "$path" ]]; then ok "$label"; else fail_msg "$label (still exists)"; fi
}

asset_name() {
  local os arch
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) say "unsupported OS"; return 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) say "unsupported arch"; return 1 ;;
  esac
  printf 'bros-%s-%s.tar.gz' "$os" "$arch"
}

ensure_pack() {
  mkdir -p "$CACHE_DIR"
  local name asset
  name="$(asset_name)"
  asset="$CACHE_DIR/$name"
  if [[ -f "$asset" && -f "$REPO_ROOT/cli/target/release/bros" && -f "$REPO_ROOT/app/ui/.output/server/index.mjs" ]]; then
    if [[ "$REPO_ROOT/cli/target/release/bros" -ot "$asset" && "$REPO_ROOT/app/ui/.output/server/index.mjs" -ot "$asset" ]]; then
      say "reuse cached $asset"
      printf '%s\n' "$asset"
      return 0
    fi
  fi
  say "building CLI + UI for pack…"
  # Keep stdout clean: callers capture only the asset path.
  cargo build --release --manifest-path "$REPO_ROOT/cli/Cargo.toml" >&2
  pnpm --dir "$REPO_ROOT/app" --filter @bros/ui build >&2
  (
    cd "$REPO_ROOT"
    scripts/pack-release.sh --name "${name%.tar.gz}" >&2
    mv -f "$REPO_ROOT/$name" "$asset"
    mv -f "$REPO_ROOT/${name}.sha256" "$CACHE_DIR/" 2>/dev/null || true
  )
  say "cached $asset"
  printf '%s\n' "$asset"
}

ensure_image() {
  say "building $IMAGE_NAME"
  docker build -t "$IMAGE_NAME" -f "$SMOKE_ROOT/Dockerfile" "$SMOKE_ROOT" >&2
}

ensure_container() {
  ensure_image
  # Core stack uses fixed names `bros` / `bros-ui`; clear leftovers from prior smoke/install.
  docker rm -f bros bros-ui >/dev/null 2>&1 || true
  mkdir -p "$HOST_SMOKE" "$CACHE_DIR"
  local want have
  want="$(docker image inspect -f '{{.Id}}' "$IMAGE_NAME")"
  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    have="$(docker inspect -f '{{.Image}}' "$CONTAINER_NAME")"
    if [[ "$have" != "$want" ]]; then
      say "recreate $CONTAINER_NAME (image changed)"
      docker rm -f "$CONTAINER_NAME" >/dev/null
    fi
  fi
  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    local running
    running="$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")"
    if [[ "$running" == "true" ]]; then
      say "reuse container $CONTAINER_NAME"
      return 0
    fi
    docker start "$CONTAINER_NAME" >/dev/null
    say "started existing $CONTAINER_NAME"
    return 0
  fi
  say "create container $CONTAINER_NAME"
  docker run -d --name "$CONTAINER_NAME" \
    --network host \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$HOST_SMOKE:$HOST_SMOKE" \
    -v "$REPO_ROOT:$REPO_ROOT:ro" \
    -v "$CACHE_DIR:$CACHE_DIR:ro" \
    -e REPO_ROOT="$REPO_ROOT" \
    -e CACHE_DIR="$CACHE_DIR" \
    -e HOST_SMOKE="$HOST_SMOKE" \
    "$IMAGE_NAME" \
    sleep infinity >/dev/null
}

cexec() {
  docker exec -e HOST_SMOKE -e CACHE_DIR -e REPO_ROOT "$CONTAINER_NAME" "$@"
}

wipe_case() {
  local case_dir="$1"
  # App containers write root-owned files into HOST_SMOKE; wipe as root in guest.
  docker exec "$CONTAINER_NAME" rm -rf "$case_dir"
  docker exec "$CONTAINER_NAME" mkdir -p "$case_dir"
}

summary() {
  say "passed=$pass failed=$fail"
  [[ "$fail" -eq 0 ]]
}
