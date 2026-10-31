#!/usr/bin/env bash
# Cases: pack once on host, install/start/uninstall inside reused smoke container.
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

ASSET="$(ensure_pack)"
[[ -f "$ASSET" ]] || { echo "smoke: pack missing: $ASSET" >&2; exit 1; }
ensure_container

INSTALL_SH="$REPO_ROOT/scripts/install.sh"
TAR_PORT="${BROS_SMOKE_TAR_PORT:-18765}"
TAR_PID=""

start_tar_server() {
  stop_tar_server
  (
    cd "$(dirname "$ASSET")"
    python3 -m http.server "$TAR_PORT" --bind 127.0.0.1 >/dev/null 2>&1
  ) &
  TAR_PID=$!
  sleep 0.4
  # Quick probe so install does not race the listener.
  curl -fsS "http://127.0.0.1:${TAR_PORT}/$(basename "$ASSET")" -o /dev/null
}
stop_tar_server() {
  if [[ -n "${TAR_PID:-}" ]] && kill -0 "$TAR_PID" 2>/dev/null; then
    kill "$TAR_PID" 2>/dev/null || true
    wait "$TAR_PID" 2>/dev/null || true
  fi
  TAR_PID=""
}
trap stop_tar_server EXIT
start_tar_server
RELEASE_URL="http://127.0.0.1:${TAR_PORT}/$(basename "$ASSET")"

# Run inside smoke container (host network + identical HOST_SMOKE paths + docker.sock).
din() {
  docker exec \
    -e HOST_SMOKE="$HOST_SMOKE" \
    -e CACHE_DIR="$CACHE_DIR" \
    -e REPO_ROOT="$REPO_ROOT" \
    -e HOME="$HOST_SMOKE/home" \
    "$CONTAINER_NAME" \
    env "$@"
}

install_into() {
  local dir="$1"
  shift
  mkdir -p "$HOST_SMOKE/home"
  din "$@" \
    HOME="$HOST_SMOKE/home" \
    BROS_DIR="$dir" \
    BROS_BIN="$dir/bin/bros" \
    BROS_RELEASE_URL="$RELEASE_URL" \
    bash "$INSTALL_SH"
  # Install runs as root in guest; let host cases rewrite .env / markers.
  docker exec "$CONTAINER_NAME" chmod -R a+rwX "$dir" "$HOST_SMOKE/home" 2>/dev/null || true
  # `bros update` during model setup leaves core containers up; stop before case starts.
  stop_install "$dir"
}

wait_health() {
  local port="${1:-3055}"
  local i
  for i in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1 \
      || curl -fsS "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

stop_install() {
  local dir="$1"
  if [[ -x "$dir/bros" ]]; then
    din BROS_DIR="$dir" BROS_BIN="$dir/bin/bros" "$dir/bros" stop >/dev/null 2>&1 || true
  fi
}

case_defaults() {
  say "case: defaults"
  local dir="$HOST_SMOKE/defaults"
  wipe_case "$dir"
  install_into "$dir" || { fail_msg "defaults: install"; return 0; }
  assert_file "$dir/bros" "defaults: binary"
  assert_file "$dir/bin/bros" "defaults: BROS_BIN"
  assert_file "$dir/uninstall.sh" "defaults: uninstall.sh"
  assert_file "$dir/.env" "defaults: .env"
  assert_file "$dir/bros.yml" "defaults: bros.yml"
  say "defaults: starting bros…"
  if din BROS_DIR="$dir" BROS_BIN="$dir/bin/bros" BROS_PORT=13055 "$dir/bros" -D; then
    if wait_health 13055; then ok "defaults: health"; else fail_msg "defaults: health"; fi
  else
    fail_msg "defaults: bros -D"
  fi
  stop_install "$dir"
  din BROS_DIR="$dir" BROS_BIN="$dir/bin/bros" "$dir/bros" uninstall || fail_msg "defaults: uninstall"
  assert_missing "$dir/bros" "defaults: binary removed"
  assert_file "$dir/.env" "defaults: .env kept"
}

case_custom_dir() {
  say "case: custom dir"
  local dir="$HOST_SMOKE/custom"
  wipe_case "$dir"
  install_into "$dir" || { fail_msg "custom: install"; return 0; }
  assert_file "$dir/bros" "custom: binary"
  assert_eq "$(readlink -f "$dir/bin/bros")" "$(readlink -f "$dir/bros")" "custom: symlink target"
  din BROS_DIR="$dir" BROS_BIN="$dir/bin/bros" "$dir/bros" uninstall --purge || fail_msg "custom: purge"
  assert_missing "$dir" "custom: purged"
}

case_split_data() {
  say "case: split data"
  local dir="$HOST_SMOKE/split" data="$HOST_SMOKE/split-data"
  wipe_case "$dir"
  wipe_case "$data"
  install_into "$dir" || { fail_msg "split: install"; return 0; }
  printf 'BROS_DATA_DIR=%s\nBROS_PORT=13056\n' "$data" >"$dir/.env"
  if din BROS_DIR="$dir" BROS_BIN="$dir/bin/bros" BROS_DATA_DIR="$data" BROS_PORT=13056 "$dir/bros" -D; then
    if wait_health 13056; then ok "split: health"; else fail_msg "split: health"; fi
    assert_file "$data" "split: data dir"
  else
    fail_msg "split: start"
  fi
  stop_install "$dir"
  din BROS_DIR="$dir" BROS_BIN="$dir/bin/bros" BROS_DATA_DIR="$data" "$dir/bros" uninstall --purge || true
  wipe_case "$data"
}

case_via_dotenv() {
  say "case: via .env (symlink invoke)"
  local dir="$HOST_SMOKE/dotenv"
  wipe_case "$dir"
  install_into "$dir" || { fail_msg "dotenv: install"; return 0; }
  printf 'BROS_PORT=13057\n' >"$dir/.env"
  # BROS_DIR unset; real bin dir holds .env
  if din BROS_PORT=13057 "$dir/bin/bros" -D; then
    if wait_health 13057; then ok "dotenv: health via symlink"; else fail_msg "dotenv: health"; fi
  else
    fail_msg "dotenv: start"
  fi
  stop_install "$dir"
  din "$dir/bin/bros" uninstall --purge || true
}

case_uninstall_keep() {
  say "case: uninstall keep data"
  local dir="$HOST_SMOKE/keep"
  wipe_case "$dir"
  install_into "$dir" || { fail_msg "keep: install"; return 0; }
  mkdir -p "$dir/data/var"
  echo keep >"$dir/data/var/marker"
  din BROS_DIR="$dir" BROS_BIN="$dir/bin/bros" "$dir/bros" uninstall || fail_msg "keep: uninstall"
  assert_missing "$dir/bros" "keep: binary gone"
  assert_missing "$dir/lib" "keep: lib gone"
  assert_file "$dir/data/var/marker" "keep: data marker"
  assert_file "$dir/.env" "keep: .env"
  assert_file "$dir/bros.yml" "keep: bros.yml"
}

case_uninstall_purge() {
  say "case: uninstall purge"
  local dir="$HOST_SMOKE/purge"
  wipe_case "$dir"
  install_into "$dir" || { fail_msg "purge: install"; return 0; }
  mkdir -p "$dir/data"
  echo x >"$dir/data/x"
  din BROS_DIR="$dir" BROS_BIN="$dir/bin/bros" "$dir/bros" uninstall --purge || fail_msg "purge: uninstall"
  assert_missing "$dir" "purge: dir gone"
}

case_defaults
case_custom_dir
case_split_data
case_via_dotenv
case_uninstall_keep
case_uninstall_purge

summary
