#!/usr/bin/env bash
# Bros install script — served at /bros/install.sh on GitHub Pages
# (src/website/public/install.sh with app.baseURL '/bros/').
#
# Usage:
#   curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
#   curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --from-src
#   curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
#
# Default (release): unpack tarball into BROS_DIR, symlink BROS_BIN. No cargo.
# --from-src: clone + cargo build (contributor path), then same BROS_BIN link.
#
# Env overrides:
#   BROS_RELEASE_URL  Exact release tarball URL. Unset picks bros-<os>-<arch>.tar.gz
#   BROS_REPO    Git clone URL for --from-src
#   BROS_DIR     Install directory (default: ~/.bros). Binary lands here.
#   BROS_CONFIG  Bootstrap YAML (default: $BROS_DIR/bros.yml)
#   BROS_BIN     PATH symlink (default: ~/.local/bin/bros)
#   BROS_REF     Git ref for --from-src (default: main)
set -euo pipefail

BROS_REPO="${BROS_REPO:-https://github.com/jasenmichael/bros.git}"
BROS_DIR="${BROS_DIR:-${HOME}/.bros}"
BROS_REF="${BROS_REF:-main}"
BROS_CONFIG="${BROS_CONFIG:-$BROS_DIR/bros.yml}"
BROS_BIN="${BROS_BIN:-${HOME}/.local/bin/bros}"
INSTALL_SERVICE=0
FROM_SRC=0

die() {
  printf '[bros] error: %s\n' "$*" >&2
  exit 1
}

info() {
  if [[ -t 1 ]]; then
    printf '\033[34m[bros]\033[0m %s\n' "$*"
  else
    printf '[bros] %s\n' "$*"
  fi
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

release_asset_name() {
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
  printf 'bros-%s-%s.tar.gz' "$os" "$arch"
}

release_url() {
  if [[ -n "${BROS_RELEASE_URL:-}" ]]; then
    printf '%s' "$BROS_RELEASE_URL"
    return
  fi
  printf 'https://github.com/jasenmichael/bros/releases/latest/download/%s' "$(release_asset_name)"
}

unpack_release() {
  need_cmd curl
  need_cmd tar
  if [[ -d "$BROS_DIR/.git" ]]; then
    die "$BROS_DIR is a source checkout. Re-run with --from-src."
  fi
  local tmp url tree name dest trash
  url="$(release_url)"
  tmp="$(mktemp -d)"
  info "Downloading $url"
  if ! curl -fL --retry 2 -o "$tmp/bros.tar.gz" "$url"; then
    rm -rf "$tmp"
    die "release not found: $url
Install from source: install.sh --from-src"
  fi
  tree="$tmp/tree"
  mkdir -p "$tree" "$BROS_DIR"
  if ! tar -xzf "$tmp/bros.tar.gz" -C "$tree"; then
    rm -rf "$tmp"
    die "could not unpack release"
  fi
  # Release files replace existing paths (keep data/).
  local path
  for path in "$tree"/*; do
    [[ -e "$path" ]] || continue
    name="$(basename "$path")"
    [[ "$name" == data ]] && continue
    trash=""
    if [[ -e "$BROS_DIR/$name" || -L "$BROS_DIR/$name" ]]; then
      if ! rm -rf "$BROS_DIR/$name" 2>/dev/null; then
        trash="$BROS_DIR/.${name}.stale-$$"
        rm -rf "$trash" 2>/dev/null || true
        mv "$BROS_DIR/$name" "$trash" || {
          rm -rf "$tmp"
          die "cannot replace $BROS_DIR/$name (fix ownership: sudo chown -R \"\$USER\" \"$BROS_DIR\")"
        }
      fi
    fi
    mv "$path" "$BROS_DIR/$name" || {
      rm -rf "$tmp"
      die "cannot install $name into $BROS_DIR"
    }
    if [[ -n "$trash" && -e "$trash" ]]; then
      rm -rf "$trash" 2>/dev/null || info "warning: left $trash (sudo rm -rf it)"
    fi
  done
  rm -rf "$tmp"
}

from_src() {
  need_cmd git
  need_cmd cargo
  if [[ -d "$BROS_DIR/.git" ]]; then
    info "Existing clone at $BROS_DIR — fetching $BROS_REF"
    git -C "$BROS_DIR" fetch --tags --prune origin
    git -C "$BROS_DIR" checkout "$BROS_REF"
    git -C "$BROS_DIR" pull --ff-only origin "$BROS_REF" || true
    git -C "$BROS_DIR" submodule update --init --depth 1
  elif [[ -e "$BROS_DIR" ]]; then
    die "$BROS_DIR exists but is not a git repo. Move it aside or set BROS_DIR."
  else
    info "Cloning $BROS_REPO ($BROS_REF) into $BROS_DIR"
    git clone --branch "$BROS_REF" --depth 1 --recurse-submodules --shallow-submodules "$BROS_REPO" "$BROS_DIR"
  fi
  info "Building CLI"
  cargo build --release --manifest-path "$BROS_DIR/cli/Cargo.toml"
  ln -sfn cli/target/release/bros "$BROS_DIR/bros"
}

ensure_dotenv() {
  if [[ -f "$BROS_DIR/example.env" && ! -f "$BROS_DIR/.env" ]]; then
    cp "$BROS_DIR/example.env" "$BROS_DIR/.env"
    info "Wrote $BROS_DIR/.env from example.env"
  fi
}

write_default_config() {
  if [[ -f "$BROS_CONFIG" ]]; then
    info "Config exists: $BROS_CONFIG"
    return 0
  fi
  mkdir -p "$(dirname "$BROS_CONFIG")"
  cat >"$BROS_CONFIG" <<'EOF'
# Bros bootstrap. Host layout is BROS_DIR + $BROS_DIR/data.
# Compose sets in-container working_dir=/app and data at /app/data.
# Uncomment to enable a named Cloudflare tunnel:
# public_url: https://bros.example.com
EOF
  info "Wrote default config: $BROS_CONFIG"
}

link_bin() {
  mkdir -p "$(dirname "$BROS_BIN")"
  [[ -x "$BROS_DIR/bros" ]] || die "CLI missing at $BROS_DIR/bros"
  ln -sfn "$BROS_DIR/bros" "$BROS_BIN"
  info "Symlink $BROS_BIN -> $BROS_DIR/bros"
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
  BROS_DIR="$BROS_DIR" BROS_CONFIG="$BROS_CONFIG" BROS_BIN="$BROS_BIN" \
    "$BROS_DIR/bros" service install
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

Bros installed at: $BROS_DIR
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
      --from-src)
        FROM_SRC=1
        shift
        ;;
      -h|--help)
        cat <<EOF
Bros install

Usage:
  curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
  curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --from-src
  curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service

Options:
  --from-src  Clone and cargo-build the CLI (optional). Default unpacks a release (no build).
  --service   Install a systemd --user unit (Linux)

Env: BROS_DIR BROS_CONFIG BROS_BIN BROS_REPO BROS_REF BROS_RELEASE_URL
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
  if [[ "$FROM_SRC" -eq 1 ]]; then
    from_src
  else
    unpack_release
  fi
  ensure_dotenv
  write_default_config
  link_bin
  maybe_install_service
  setup_packaged_model
  print_next_steps
}

setup_packaged_model() {
  if [[ ! -f "$BROS_DIR/lib/apps/core/ollama/BROS_MODEL_VERSION" ]]; then
    return 0
  fi
  if [[ ! -x "$BROS_DIR/bros" ]]; then
    return 0
  fi
  info "Installing the packaged model…"
  BROS_MODEL_SETUP=1 "$BROS_DIR/bros" update
}

main "$@"
