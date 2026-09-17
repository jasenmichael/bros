#!/usr/bin/env bash
# Host Cloudflare tunnel: install/login wizard + helper that owns a cloudflared child.
# Sourced by ./bros. Do not sudo from this script unless the human confirmed.
# shellcheck disable=SC2034

bros_tunnel_dir() {
  echo "${BROS_TUNNEL_DIR:-${BROS_HOST_DATA_DIR:-${BROS_DIR:-.}/data}/tunnel}"
}

# First matching bootstrap YAML (same exclusive-or-search idea as loadBootstrapConfig).
bros_find_bootstrap_yaml() {
  if [[ -n "${BROS_CONFIG_HOST:-}" && -f "$BROS_CONFIG_HOST" ]]; then
    printf '%s\n' "$BROS_CONFIG_HOST"
    return 0
  fi
  if [[ -n "${BROS_CONFIG:-}" && "$BROS_CONFIG" != "/app/bros.yml" && -f "$BROS_CONFIG" ]]; then
    printf '%s\n' "$BROS_CONFIG"
    return 0
  fi
  local roots=() root
  if [[ -n "${BROS_DIR:-}" ]]; then
    roots+=("$BROS_DIR")
  else
    roots+=(".")
  fi
  for root in "${roots[@]}"; do
    if [[ -f "$root/bros.yml" ]]; then
      printf '%s\n' "$root/bros.yml"
      return 0
    fi
    if [[ -f "$root/.config/bros.yml" ]]; then
      printf '%s\n' "$root/.config/bros.yml"
      return 0
    fi
  done
  return 1
}

bros_yaml_scalar() {
  local file="$1" key="$2" val=""
  [[ -f "$file" ]] || return 0
  val="$(awk -v key="$key" '
    $1 == key":" {
      val=$0
      sub("^[^:]+:[[:space:]]*", "", val)
      print val
      exit
    }
  ' "$file")"
  val="${val#\"}"
  val="${val%\"}"
  val="${val#\'}"
  val="${val%\'}"
  printf '%s' "$val"
}

bros_tunnel_trim() {
  local s="$1"
  s="$(printf '%s' "$s" | tr -d '\r')"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

bros_hostname_from_public_url() {
  local raw
  raw="$(bros_tunnel_trim "${1:-}")"
  [[ -n "$raw" ]] || return 0
  raw="${raw#http://}"
  raw="${raw#https://}"
  raw="${raw%%/*}"
  raw="${raw%%:*}"
  printf '%s' "$raw"
}

bros_tunnel_read_public_url() {
  local env_url file
  env_url="$(bros_tunnel_trim "${BROS_PUBLIC_URL:-}")"
  if [[ -n "$env_url" ]]; then
    printf '%s' "$env_url"
    return 0
  fi
  file="$(bros_find_bootstrap_yaml)" || return 0
  bros_tunnel_trim "$(bros_yaml_scalar "$file" "public_url")"
}

bros_tunnel_persist_public_url() {
  local url host
  url="$(bros_tunnel_trim "${1:-}")"
  bros_tunnel_ensure_dir
  if [[ -n "$url" ]]; then
    printf '%s\n' "$url" >"$(bros_tunnel_dir)/public_url"
    host="$(bros_hostname_from_public_url "$url")"
    if [[ -n "$host" ]]; then
      printf '%s\n' "$host" >"$(bros_tunnel_dir)/hostname"
    fi
  else
    rm -f "$(bros_tunnel_dir)/public_url"
  fi
}

# public_url set → enable + persist advertised URL. Unset → no config autostart.
# Returns 0 when startup should start the tunnel.
bros_tunnel_apply_public_url() {
  local url
  url="$(bros_tunnel_read_public_url)"
  bros_tunnel_persist_public_url "$url"
  if [[ -n "$url" ]]; then
    export BROS_PUBLIC_URL="$url"
    bros_tunnel_set_enabled 1
    return 0
  fi
  return 1
}

bros_tunnel_report_start_result() {
  local dir i err
  dir="$(bros_tunnel_dir)"
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if [[ -f "$dir/status.json" ]] && grep -q '"running":true' "$dir/status.json" 2>/dev/null; then
      return 0
    fi
    if [[ -f "$dir/error" ]]; then
      err="$(head -c 800 "$dir/error")"
      if [[ -n "$err" ]]; then
        echo "error: Cloudflare tunnel failed to start: $err" >&2
        return 1
      fi
    fi
    sleep 0.5
  done
  if [[ -f "$dir/error" ]]; then
    echo "error: Cloudflare tunnel failed to start: $(head -c 800 "$dir/error")" >&2
    return 1
  fi
  echo "error: Cloudflare tunnel did not become ready. Check the Dashboard Tunnel card or $dir/logs.txt" >&2
  return 1
}

bros_tunnel_ensure_dir() {
  mkdir -p "$(bros_tunnel_dir)"
}

bros_tunnel_enabled() {
  local f
  f="$(bros_tunnel_dir)/enabled"
  [[ -f "$f" && "$(tr -d '[:space:]' <"$f")" == "1" ]]
}

bros_tunnel_enabled_known() {
  [[ -f "$(bros_tunnel_dir)/enabled" ]]
}

bros_tunnel_set_enabled() {
  bros_tunnel_ensure_dir
  printf '%s\n' "$1" >"$(bros_tunnel_dir)/enabled"
}

bros_tunnel_bin() {
  if command -v cloudflared >/dev/null 2>&1; then
    command -v cloudflared
    return 0
  fi
  if [[ -x "${HOME}/.local/bin/cloudflared" ]]; then
    echo "${HOME}/.local/bin/cloudflared"
    return 0
  fi
  return 1
}

# Login = existing cert, or `cloudflared tunnel list` succeeding.
bros_tunnel_logged_in() {
  local cert="${CLOUDFLARED_CERT:-${HOME}/.cloudflared/cert.pem}"
  [[ -f "$cert" ]] && return 0
  local bin=""
  bin="$(bros_tunnel_bin)" || return 1
  "$bin" tunnel list >/dev/null 2>&1
}

bros_tunnel_cf_arch() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os" in
    linux)
      if [[ -f /etc/debian_version ]] && command -v dpkg >/dev/null 2>&1; then
        dpkg --print-architecture
        return 0
      fi
      case "$arch" in
        x86_64|amd64) echo amd64 ;;
        aarch64|arm64) echo arm64 ;;
        *) return 1 ;;
      esac
      ;;
    darwin)
      case "$arch" in
        x86_64) echo amd64 ;;
        arm64) echo arm64 ;;
        *) return 1 ;;
      esac
      ;;
    *)
      return 1
      ;;
  esac
}

# User-local binary (no sudo). Preferred when sudo is unavailable.
bros_tunnel_install_user_local() {
  local dest="${HOME}/.local/bin/cloudflared"
  local os arch url
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(bros_tunnel_cf_arch)" || {
    echo "error: unsupported architecture $(uname -m)" >&2
    return 1
  }
  mkdir -p "${HOME}/.local/bin"
  case "$os" in
    linux) url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}" ;;
    darwin) url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${arch}" ;;
    *)
      echo "error: use the Windows PowerShell snippet (see docs) or install inside WSL" >&2
      return 1
      ;;
  esac
  echo "Downloading $url → $dest"
  curl -fL --retry 3 -o "$dest" "$url" || return 1
  chmod +x "$dest"
  export PATH="${HOME}/.local/bin:${PATH}"
  "$dest" --version
}

# System package/binary. Requires human-approved sudo.
bros_tunnel_install_system() {
  local os arch dpkg_arch rpm_arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os" in
    darwin)
      ARCH="$(uname -m)"
      if [ "$ARCH" = "x86_64" ]; then CF_ARCH="amd64"
      elif [ "$ARCH" = "arm64" ]; then CF_ARCH="arm64"
      else echo "Unsupported macOS architecture: $ARCH" >&2 && return 1
      fi
      curl -fL --retry 3 -o /tmp/bros-cloudflared "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-$CF_ARCH" \
        && chmod +x /tmp/bros-cloudflared \
        && sudo mv /tmp/bros-cloudflared /usr/local/bin/cloudflared \
        && cloudflared --version
      ;;
    linux)
      if [ -f /etc/debian_version ]; then
        dpkg_arch="$(dpkg --print-architecture)"
        curl -fL --retry 3 -o /tmp/bros-cf.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${dpkg_arch}.deb"
        sudo dpkg -i /tmp/bros-cf.deb && rm -f /tmp/bros-cf.deb
      elif [ -f /etc/redhat-release ] || [ -f /etc/fedora-release ]; then
        rpm_arch="$([ "$arch" = "x86_64" ] && echo "x86_64" || echo "aarch64")"
        curl -fL --retry 3 -o /tmp/bros-cf.rpm "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${rpm_arch}.rpm"
        sudo rpm -i /tmp/bros-cf.rpm && rm -f /tmp/bros-cf.rpm
      else
        CF_ARCH="$([ "$arch" = "x86_64" ] && echo "amd64" || echo "arm64")"
        curl -fL --retry 3 -o /tmp/bros-cloudflared "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF_ARCH"
        chmod +x /tmp/bros-cloudflared && sudo mv /tmp/bros-cloudflared /usr/local/bin/cloudflared
      fi
      cloudflared --version
      ;;
    *)
      echo "error: native Windows install uses elevated PowerShell (see docs/configuration.md)" >&2
      return 1
      ;;
  esac
}

bros_tunnel_print_windows_snippet() {
  cat <<'EOF'
Windows (elevated PowerShell):

$arch = if ([Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }
$url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-$arch.exe"
$installDir = "$env:ProgramFiles\cloudflared"
New-Item -ItemType Directory -Force -Path $installDir
Invoke-WebRequest -Uri $url -OutFile "$installDir\cloudflared.exe"
[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "Machine") + ";$installDir", "Machine")
Write-Host "Installation Complete! Restart the terminal and run 'cloudflared --version'."

Or install to %USERPROFILE%\.local\bin without elevation, then add that folder to Path.
EOF
}

bros_tunnel_is_windows() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
  esac
  [[ "${OS:-}" == "Windows_NT" ]]
}

# Interactive wizard (human only: sudo / browser login). Skip when already ready.
bros_tunnel_wizard() {
  local need_install=0 need_login=0
  export PATH="${HOME}/.local/bin:${PATH}"
  if ! bros_tunnel_bin >/dev/null; then
    need_install=1
  fi
  if ! bros_tunnel_logged_in; then
    need_login=1
  fi
  if [[ "$need_install" -eq 0 && "$need_login" -eq 0 ]]; then
    return 0
  fi

  if [[ ! -t 0 ]]; then
    echo "Tunnel enabled but setup is incomplete (non-interactive):" >&2
    [[ "$need_install" -eq 1 ]] && echo "  cloudflared is not on PATH. Install to ~/.local/bin or rerun ./bros in a terminal." >&2
    [[ "$need_login" -eq 1 ]] && echo "  Not logged in. Run: cloudflared login" >&2
    return 1
  fi

  echo ""
  echo "Cloudflare tunnel setup (host cloudflared — not a Docker sidecar)"
  echo ""

  if [[ "$need_install" -eq 1 ]]; then
    echo "▸ Stage 1 · Install cloudflared"
    if bros_tunnel_is_windows; then
      bros_tunnel_print_windows_snippet
      read -r -p "Press Enter after cloudflared is on PATH… " _ || true
    else
      echo "  Preferred: user-local binary in ~/.local/bin (no sudo)."
      echo "  Alternate: system package/binary (sudo — you type the password)."
      read -r -p "Install cloudflared now? [Y/n] " ans || true
      case "${ans:-Y}" in
        n|N|no|NO) echo "Skipped. Tunnel will stay off until cloudflared is installed." ; return 1 ;;
      esac
      read -r -p "Use user-local ~/.local/bin (recommended)? [Y/n] " ans || true
      case "${ans:-Y}" in
        n|N|no|NO)
          read -r -p "System install needs sudo. Continue? [y/N] " ans || true
          case "${ans:-}" in
            y|Y|yes|YES) bros_tunnel_install_system || return 1 ;;
            *) echo "Skipped." ; return 1 ;;
          esac
          ;;
        *)
          bros_tunnel_install_user_local || return 1
          ;;
      esac
    fi
    export PATH="${HOME}/.local/bin:${PATH}"
    if ! bros_tunnel_bin >/dev/null; then
      echo "error: cloudflared still not on PATH" >&2
      return 1
    fi
    echo "  cloudflared: $(bros_tunnel_bin)"
  fi

  if ! bros_tunnel_logged_in; then
    echo ""
    echo "▸ Stage 2 · cloudflared login"
    echo "  Opens a browser so Cloudflare can authorize this host (writes ~/.cloudflared/cert.pem)."
    if [[ ! -t 0 ]]; then
      echo "  Non-interactive: run cloudflared login yourself." >&2
      return 1
    fi
    read -r -p "Run cloudflared login now? [Y/n] " ans || true
    case "${ans:-Y}" in
      n|N|no|NO) echo "Skipped. Tunnel will stay off until you run: cloudflared login" ; return 1 ;;
    esac
    "$(bros_tunnel_bin)" login || return 1
    if ! bros_tunnel_logged_in; then
      echo "error: login did not produce ~/.cloudflared/cert.pem" >&2
      return 1
    fi
  fi

  echo "Tunnel setup complete."
  return 0
}

# public_url is the enable signal. First-run prompt only when that key is unset.
bros_tunnel_startup() {
  export PATH="${HOME}/.local/bin:${PATH}"
  bros_tunnel_ensure_dir

  if bros_tunnel_apply_public_url; then
    :
  elif ! bros_tunnel_enabled_known; then
    if [[ -t 0 ]]; then
      echo ""
      read -r -p "Enable Cloudflare tunnel (host cloudflared quick tunnel to :${BROS_PORT:-3055})? [y/N] " ans || true
      case "${ans:-}" in
        y|Y|yes|YES) bros_tunnel_set_enabled 1 ;;
        *) bros_tunnel_set_enabled 0 ;;
      esac
    else
      bros_tunnel_set_enabled 0
    fi
  fi

  if ! bros_tunnel_enabled; then
    bros_tunnel_start_helper
    return 0
  fi

  if bros_tunnel_wizard; then
    bros_tunnel_start_helper
    printf 'start\n' >"$(bros_tunnel_dir)/command"
    bros_tunnel_report_start_result || true
  else
    echo "error: Cloudflare tunnel failed to start (install/login incomplete)." >&2
    if [[ ! -f "$(bros_tunnel_dir)/error" ]]; then
      echo "Tunnel enabled but install/login incomplete. Install cloudflared and run: cloudflared login" >"$(bros_tunnel_dir)/error"
    fi
    bros_tunnel_start_helper
  fi
}

bros_tunnel_helper_pidfile() {
  echo "$(bros_tunnel_dir)/helper.pid"
}

bros_tunnel_helper_alive() {
  local pf pid
  pf="$(bros_tunnel_helper_pidfile)"
  [[ -f "$pf" ]] || return 1
  pid="$(tr -d '[:space:]' <"$pf")"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

bros_tunnel_start_helper() {
  bros_tunnel_ensure_dir
  export PATH="${HOME}/.local/bin:${PATH}"
  if bros_tunnel_helper_alive; then
    return 0
  fi
  local script dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  script="${dir}/bros-tunnel-helper.sh"
  [[ -f "$script" ]] || {
    echo "error: missing $script" >&2
    return 1
  }
  echo "Starting host tunnel helper…"
  nohup env \
    PATH="${PATH}" \
    HOME="${HOME}" \
    BROS_TUNNEL_DIR="$(bros_tunnel_dir)" \
    BROS_PORT="${BROS_PORT:-3055}" \
    BROS_PUBLIC_URL="${BROS_PUBLIC_URL:-}" \
    bash "$script" \
    >>"$(bros_tunnel_dir)/helper.log" 2>&1 &
  echo $! >"$(bros_tunnel_helper_pidfile)"
}

bros_tunnel_stop_cloudflared() {
  local dir pidf pid
  dir="$(bros_tunnel_dir)"
  pidf="${dir}/cloudflared.pid"
  if [[ -f "$pidf" ]]; then
    pid="$(tr -d '[:space:]' <"$pidf")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 0.3
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidf"
  fi
}

bros_tunnel_stop_helper() {
  local pf pid
  pf="$(bros_tunnel_helper_pidfile)"
  if [[ -f "$pf" ]]; then
    pid="$(tr -d '[:space:]' <"$pf")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 0.2
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pf"
  fi
  bros_tunnel_stop_cloudflared
}

# Leftover Docker sidecar from before host cloudflared.
bros_tunnel_cleanup_sidecar() {
  local leftover
  docker compose -p bros-sc-cloudflared down --timeout 10 --remove-orphans >/dev/null 2>&1 || true
  leftover="$(docker ps -aq --filter 'name=bros-sc-cloudflared' 2>/dev/null || true)"
  if [[ -n "$leftover" ]]; then
    echo "Removing leftover cloudflared sidecar containers…"
    # shellcheck disable=SC2086
    docker stop $leftover >/dev/null 2>&1 || true
    # shellcheck disable=SC2086
    docker rm $leftover >/dev/null 2>&1 || true
  fi
}
