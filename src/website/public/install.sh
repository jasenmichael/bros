#!/usr/bin/env bash
# Bros install script — served at /bros/install.sh on GitHub Pages
# (src/website/public/install.sh with app.baseURL '/bros/').
#
# Usage:
#   curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
#
# Env overrides:
#   BROS_REPO   Git clone URL (default: https://github.com/jasenmichael/bros.git)
#   BROS_DIR    Install directory (default: ~/.bros)
#   BROS_REF    Git ref to checkout (default: main)
set -euo pipefail

BROS_REPO="${BROS_REPO:-https://github.com/jasenmichael/bros.git}"
BROS_DIR="${BROS_DIR:-${HOME}/.bros}"
BROS_REF="${BROS_REF:-main}"

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
  if [[ -d "$BROS_DIR/.git" ]]; then
    info "Existing clone at $BROS_DIR — fetching $BROS_REF"
    git -C "$BROS_DIR" fetch --tags --prune origin
    git -C "$BROS_DIR" checkout "$BROS_REF"
    git -C "$BROS_DIR" pull --ff-only origin "$BROS_REF" || true
    return 0
  fi
  if [[ -e "$BROS_DIR" ]]; then
    die "$BROS_DIR exists but is not a git repo. Move it aside or set BROS_DIR."
  fi
  info "Cloning $BROS_REPO ($BROS_REF) into $BROS_DIR"
  git clone --branch "$BROS_REF" --depth 1 "$BROS_REPO" "$BROS_DIR"
}

print_next_steps() {
  cat <<EOF

Bros installed at: $BROS_DIR

No host Node required — Docker-only path.

Next:
  cd $BROS_DIR
  ./bros --dev

Production (daemon):
  ./bros -D

Default action (no command) is start. Explicit start still works as an alias.
--dev always interactive (-D/--daemon ignored). Interactive Ctrl+C stops containers.

If ./bros is missing, fall back to:
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up

Rebuild when Dockerfile/compose change:
  ./bros update --dev

Stop / status (explicit commands):
  ./bros stop --dev
  ./bros status --dev
  # or: docker compose -f docker-compose.yml -f docker-compose.dev.yml down

Docs: https://jasenmichael.github.io/bros/
  Repo docs: README.md and docs/getting-started.md
EOF
}


main() {
  info "Checking Docker + Compose…"
  check_docker
  clone_repo
  if [[ -x "$BROS_DIR/bros" ]]; then
    info "Found ./bros CLI"
  else
    info "No ./bros yet — use docker compose from the repo root (see next steps)."
  fi
  print_next_steps
}

main "$@"
