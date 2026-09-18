#!/usr/bin/env bash
# Bros install script — served at /bros/install.sh on GitHub Pages
# (src/website/public/install.sh with app.baseURL '/bros/').
#
# Usage:
#   curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
#   curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
#
# Env overrides:
#   BROS_REPO    Git clone URL (default: https://github.com/jasenmichael/bros.git)
#   BROS_HOME    Install directory (default: ~/.bros). BROS_DIR is an alias.
#   BROS_CONFIG  Bootstrap YAML (default: ~/.config/bros.yml)
#   BROS_BIN     PATH symlink (default: ~/.local/bin/bros)
#   BROS_REF     Git ref to checkout (default: main)
set -euo pipefail

BROS_REPO="${BROS_REPO:-https://github.com/jasenmichael/bros.git}"
if [[ -z "${BROS_HOME:-}" ]]; then
  BROS_HOME="${BROS_DIR:-${HOME}/.bros}"
fi
BROS_DIR="$BROS_HOME"
BROS_REF="${BROS_REF:-main}"
BROS_CONFIG="${BROS_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/bros.yml}"
BROS_BIN="${BROS_BIN:-${HOME}/.local/bin/bros}"
INSTALL_SERVICE=0

die() {
  printf 'bros install: error: %s\n' "$*" >&2
  exit 1
}

info() {
  printf 'bros install: %s\n' "$*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' not found. Install it, then re-run."
}

check_docker() {
  need_cmd docker
  if ! docker info >/dev/null 2>&1; then
    die "Docker is installed but not usable (daemon down, or permission denied). Start Docker / join the docker group, then re-run."
  fi

  if docker compose version >/dev/null 2>&1; then
    return 0
  fi
  if docker-compose version >/dev/null 2>&1; then
    info "Found legacy docker-compose; Compose V2 plugin ('docker compose') preferred."
    return 0
  fi
  die "Docker Compose not found. Install the Compose V2 plugin ('docker compose'), then re-run."
}

clone_repo() {
  need_cmd git
  if [[ -d "$BROS_HOME/.git" ]]; then
    info "Existing clone at $BROS_HOME — fetching $BROS_REF"
    git -C "$BROS_HOME" fetch --tags --prune origin
    git -C "$BROS_HOME" checkout "$BROS_REF"
    git -C "$BROS_HOME" pull --ff-only origin "$BROS_REF" || true
    git -C "$BROS_HOME" submodule update --init --depth 1
    return 0
  fi
  if [[ -e "$BROS_HOME" ]]; then
    die "$BROS_HOME exists but is not a git repo. Move it aside or set BROS_HOME."
  fi
  info "Cloning $BROS_REPO ($BROS_REF) into $BROS_HOME"
  git clone --branch "$BROS_REF" --depth 1 --recurse-submodules --shallow-submodules "$BROS_REPO" "$BROS_HOME"
}

write_default_config() {
  if [[ -f "$BROS_CONFIG" ]]; then
    info "Config exists: $BROS_CONFIG"
    return 0
  fi
  mkdir -p "$(dirname "$BROS_CONFIG")"
  cat >"$BROS_CONFIG" <<'EOF'
# Bros bootstrap. Host layout is BROS_HOME + $BROS_HOME/data.
# Compose sets in-container working_dir=/app and data_dir=/data.
# Uncomment to enable a named Cloudflare tunnel:
# public_url: https://bros.example.com
EOF
  info "Wrote default config: $BROS_CONFIG"
}

link_bin() {
  mkdir -p "$(dirname "$BROS_BIN")"
  [[ -x "$BROS_HOME/bros" ]] || die "CLI missing at $BROS_HOME/bros"
  ln -sfn "$BROS_HOME/bros" "$BROS_BIN"
  info "Symlink $BROS_BIN -> $BROS_HOME/bros"
  case ":$PATH:" in
    *":$(dirname "$BROS_BIN"):"*) ;;
    *)
      info "warning: $(dirname "$BROS_BIN") is not on PATH. Add it so 'bros' works from any cwd."
      ;;
  esac
}

install_service() {
  case "$(uname -s)" in
    Linux) ;;
    *)
      info "Service skipped (Linux systemd --user only)."
      return 0
      ;;
  esac
  if ! command -v systemctl >/dev/null 2>&1; then
    info "No systemctl — skipping service."
    return 0
  fi
  info "Installing systemd --user unit…"
  BROS_HOME="$BROS_HOME" BROS_DIR="$BROS_HOME" BROS_CONFIG="$BROS_CONFIG" BROS_BIN="$BROS_BIN" \
    "$BROS_HOME/bros" service install
}

maybe_install_service() {
  if [[ "$INSTALL_SERVICE" -eq 1 ]]; then
    install_service
    return 0
  fi
  if [[ -t 0 ]]; then
    read -r -p "Install as a systemd user service? [y/N] " ans || true
    case "${ans:-}" in
      y|Y|yes|YES) install_service ;;
    esac
  fi
}

print_next_steps() {
  cat <<EOF

Bros installed at: $BROS_HOME
Config: $BROS_CONFIG
Command: $BROS_BIN

No host Node required — Docker-only path.

Next:
  bros
  bros -D

Default action (no command) is start (interactive). Ctrl+C stops the full stack.
Daemon: bros -D
Stop / status:
  bros stop
  bros status
  bros service status

Docs: https://jasenmichael.github.io/bros/
  Repo docs: README.md and docs/getting-started.md
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --service)
        INSTALL_SERVICE=1
        shift
        ;;
      -h|--help)
        cat <<EOF
Bros install

Usage:
  curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
  curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service

Options:
  --service   Install a systemd --user unit (Linux)

Env: BROS_HOME BROS_DIR BROS_CONFIG BROS_BIN BROS_REPO BROS_REF
EOF
        exit 0
        ;;
      *)
        die "unknown argument: $1"
        ;;
    esac
  done
}

main() {
  parse_args "$@"
  info "Checking Docker + Compose…"
  check_docker
  clone_repo
  write_default_config
  link_bin
  maybe_install_service
  print_next_steps
}

main "$@"
