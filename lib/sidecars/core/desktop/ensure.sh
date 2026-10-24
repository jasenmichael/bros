#!/bin/bash
# Install missing package apps after the Desktop session is up. One failure does not stop the rest.
set -u
HOME_DIR=/home/bros
PROFILE_BIN="$HOME_DIR/.local/share/devbox/global/default/.devbox/nix/profile/default/bin"
NIX_BIN="$HOME_DIR/.nix-profile/bin"
export HOME="$HOME_DIR"
export XDG_DATA_HOME="$HOME_DIR/.local/share"
export XDG_STATE_HOME="$HOME_DIR/.local/state"
export XDG_CACHE_HOME="$HOME_DIR/.cache"
export XDG_CONFIG_HOME="$HOME_DIR/.config"
export PATH="$PROFILE_BIN:$NIX_BIN:$HOME_DIR/.cargo/bin:$HOME_DIR/.local/bin:/usr/local/bin:$PATH"
LIST=/opt/bros/apps/ensure.list
REMOVE=/opt/bros/apps/ensure.remove
STATUS=/var/log/bros/ensure.json
INSTALL=/opt/bros/install.mjs
if [ -f /app/lib/sidecars/core/desktop/install.mjs ]; then
  INSTALL=/app/lib/sidecars/core/desktop/install.mjs
fi
mkdir -p /var/log/bros /etc/nix "$HOME_DIR/.local/bin" "$XDG_DATA_HOME/devbox" "$XDG_STATE_HOME/nix"
if [ ! -f /etc/nix/nix.conf ]; then
  printf '%s\n' 'sandbox = false' 'experimental-features = nix-command flakes' 'build-users-group =' 'use-xdg-base-directories = true' > /etc/nix/nix.conf
fi

failures=()
version=""

fail_json() {
  local out="[" first=1 item
  for item in "${failures[@]}"; do
    [ "$first" = 1 ] || out+=","
    first=0
    out+="\"$item\""
  done
  printf '%s' "$out]"
}

write_status() {
  printf '{"running":%s,"current":"%s","version":"%s","failures":%s}\n' "$1" "$2" "$version" "$(fail_json)" > "$STATUS"
}

as_user() {
  if id abc >/dev/null 2>&1; then
    runuser -u abc -- env \
      HOME="$HOME_DIR" \
      XDG_DATA_HOME="$XDG_DATA_HOME" \
      XDG_STATE_HOME="$XDG_STATE_HOME" \
      XDG_CACHE_HOME="$XDG_CACHE_HOME" \
      XDG_CONFIG_HOME="$XDG_CONFIG_HOME" \
      PATH="$PATH" \
      BROS_NODE_VERSION="${BROS_NODE_VERSION:-}" \
      CARGO_HOME="$HOME_DIR/.cargo" \
      bash -lc "$1"
  else
    bash -lc "$1"
  fi
}

bins_ok() {
  local rest="$1" name
  [ -n "$rest" ] || return 1
  while [ -n "$rest" ]; do
    name=${rest%%,*}
    if [ "$rest" = "$name" ]; then rest=; else rest=${rest#*,}; fi
    as_user "p=\$(command -v $(printf '%q' "$name")) && test -x \"\$p\"" || return 1
  done
}

if ! as_user 'p=$(command -v nix) && test -x "$p"'; then
  write_status true Nix
  uid=${PUID:-1000}
  gid=${PGID:-1000}
  mkdir -p /nix
  chown "$uid:$gid" /nix
  as_user 'NIX_INSTALLER_NO_CHANNEL_ADD=1 curl -fsSL https://nixos.org/nix/install | sh -s -- --no-daemon --yes' || failures+=(nix)
  chmod -R a+rX /nix "$HOME_DIR/.nix-profile" "$HOME_DIR/.local/state/nix" 2>/dev/null || true
fi

if [ -f "$LIST" ]; then
  while IFS=$'\t' read -r id kind spec bins; do
    [ -n "${id:-}" ] || continue
    write_status true "$id"
    if [ "$kind" = nix ]; then
      if [ "$id" = node ]; then
        pin=${BROS_NODE_VERSION:-26.7.0}
        pin=${pin#v}
        spec="nodejs@$pin"
      fi
      if [ -n "$bins" ] && bins_ok "$bins"; then
        if [ "$id" = node ]; then
          landed=$(as_user 'node -v 2>/dev/null || true')
          version=${landed#v}
          version=${version%%[!0-9A-Za-z._+-]*}
        fi
        continue
      fi
      if as_user "devbox global add $(printf '%q' "$spec")"; then
        chmod -R a+rX "$PROFILE_BIN" 2>/dev/null || true
        if [ "$id" = node ]; then
          landed=$(as_user 'node -v 2>/dev/null || true')
          version=${landed#v}
          version=${version%%[!0-9A-Za-z._+-]*}
        fi
        continue
      fi
      if [ "$id" = node ]; then
        major=${pin%%.*}
        if as_user "devbox global add nodejs@$major"; then
          chmod -R a+rX "$PROFILE_BIN" 2>/dev/null || true
          landed=$(as_user 'node -v 2>/dev/null || true')
          version=${landed#v}
          version=${version%%[!0-9A-Za-z._+-]*}
          continue
        fi
      fi
      failures+=("$id")
      continue
    fi
    if [ "$kind" = apt ] && [ -z "$bins" ]; then
      dpkg -s "$spec" >/dev/null 2>&1 && continue
    elif [ -n "$bins" ] && bins_ok "$bins"; then
      continue
    fi
    if [ "$kind" = npm ] && ! bins_ok "node,npm,npx"; then
      failures+=("$id")
      continue
    fi
    if ! bins_ok "node"; then
      failures+=("$id")
      continue
    fi
    hash -r
    if ! node "$INSTALL" --only "$id" /opt/bros/apps/ensure/packages.json; then
      failures+=("$id")
    fi
  done < "$LIST"
fi

if [ -f "$REMOVE" ]; then
  hash -r
  while read -r id; do
    [ -n "${id:-}" ] || continue
    write_status true "$id"
    if node "$INSTALL" --remove "$id"; then
      rm -rf "/opt/bros/apps/ensure/remove/$id"
    else
      failures+=("$id")
    fi
  done < "$REMOVE"
  rm -f "$REMOVE"
fi

write_status false ""
