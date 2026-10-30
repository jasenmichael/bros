#!/bin/bash
# Install missing package apps after the Desktop session is up. One failure does not stop the rest.
set -u
HOME_DIR=/home/bros
PROFILE_BIN="$HOME_DIR/.local/share/devbox/global/default/.devbox/nix/profile/default/bin"
export HOME="$HOME_DIR"
export XDG_DATA_HOME="$HOME_DIR/.local/share"
export XDG_STATE_HOME="$HOME_DIR/.local/state"
export XDG_CACHE_HOME="$HOME_DIR/.cache"
export XDG_CONFIG_HOME="$HOME_DIR/.config"
export PATH="/home/bros/.local/app-bins:$PATH"
LIST=/opt/bros/apps/ensure.list
REMOVE=/opt/bros/apps/ensure.remove
STATUS=/var/log/bros/ensure.json
INSTALL=/opt/bros/install.ts
if [ -f /app/lib/desktop/install.ts ]; then
  INSTALL=/app/lib/desktop/install.ts
fi
mkdir -p /var/log/bros /etc/nix "$HOME_DIR/.local/bin" "$XDG_DATA_HOME/devbox" "$XDG_STATE_HOME/nix"
if [ ! -f /etc/nix/nix.conf ]; then
  printf '%s\n' 'sandbox = false' 'experimental-features = nix-command flakes' 'build-users-group =' 'use-xdg-base-directories = true' > /etc/nix/nix.conf
fi
# A store path or profile on the mounts is the cache. A missing profile link is not a new install.
nix_bin=
for cand in /nix/store/*-nix-*/bin/nix "$HOME_DIR/.nix-profile/bin/nix" /nix/var/nix/profiles/default/bin/nix; do
  [ -x "$cand" ] || continue
  nix_bin=$cand
  break
done
if [ -n "$nix_bin" ] && [ ! -x /nix/var/nix/profiles/default/bin/nix ]; then
  mkdir -p /nix/var/nix/profiles/default/bin
  for cmd in "$(dirname "$nix_bin")"/*; do
    [ -x "$cmd" ] || continue
    ln -sfn "$cmd" "/nix/var/nix/profiles/default/bin/$(basename "$cmd")"
  done
fi
if [ -n "$nix_bin" ] && [ ! -e "$HOME_DIR/.nix-profile" ]; then
  ln -sfn /nix/var/nix/profiles/default "$HOME_DIR/.nix-profile"
fi
# A restored store can be owned by a uid that no longer exists. The desktop user
# must lock the database and create store paths. Do not chown store objects.
uid=${PUID:-1000}
gid=${PGID:-1000}
[ -d /nix/store ] && chown "$uid:$gid" /nix/store
[ -d "$XDG_STATE_HOME/nix" ] && chown "$uid:$gid" "$XDG_STATE_HOME/nix"
if [ -d /nix/var/nix/db ]; then
  chown "$uid:$gid" /nix/var/nix/db
  for f in db.sqlite db.sqlite-shm db.sqlite-wal big-lock reserved schema; do
    [ -e "/nix/var/nix/db/$f" ] && chown "$uid:$gid" "/nix/var/nix/db/$f"
  done
fi
for d in /nix/var /nix/var/nix /nix/var/log /nix/var/log/nix /nix/var/log/nix/drvs /nix/var/nix/temproots /nix/var/nix/builds /nix/var/nix/gcroots /nix/var/nix/gcroots/per-user /nix/var/nix/gcroots/auto /nix/var/nix/profiles /nix/var/nix/profiles/per-user; do
  [ -d "$d" ] && chown "$uid:$gid" "$d"
done
[ -e /nix/var/nix/gc.lock ] && chown "$uid:$gid" /nix/var/nix/gc.lock

failures=()
steps=()
version=""
# If ensure dies mid-install, do not leave running:true stuck for the UI.
trap 'write_status false ""' EXIT

json_list() {
  local out="[" first=1 item
  for item in "$@"; do
    [ "$first" = 1 ] || out+=","
    first=0
    out+="\"$item\""
  done
  printf '%s' "$out]"
}

write_status() {
  printf '{"running":%s,"current":"%s","version":"%s","failures":%s,"steps":%s}\n' \
    "$1" "$2" "$version" "$(json_list "${failures[@]}")" "$(json_list "${steps[@]}")" > "$STATUS"
}

home_mgr() {
  [ "$1" = nix ] || [ "$1" = npm ]
}

mark() {
  steps+=("$1")
  write_status true "$2"
}

as_user() {
  local cmd="eval \"\$(devbox global shellenv --init-hook 2>/dev/null)\" || true; $1"
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
      bash -lc "$cmd"
  else
    bash -lc "$cmd"
  fi
}

bins_ok() {
  local rest="$1" name
  [ -n "$rest" ] || return 1
  while [ -n "$rest" ]; do
    name=${rest%%,*}
    if [ "$rest" = "$name" ]; then rest=; else rest=${rest#*,}; fi
    # app-bins holds launch.sh. It is not the installed package.
    as_user "p=\$(PATH=\$(printf '%s' \"\$PATH\" | tr ':' '\n' | grep -v '/[.]local/app-bins\$' | paste -sd: -) command -v $(printf '%q' "$name")) && test -x \"\$p\"" || return 1
  done
}

# A matching install is already running. Do not start another one.
already_installing() {
  local kind="$1" id="$2" spec="$3" line
  if [ "$kind" != devbox ] && [ -z "${spec}${id}" ]; then
    return 1
  fi
  while IFS= read -r line; do
    case "$line" in
      *grep*) continue ;;
    esac
    if [ "$kind" = nix ] && [ -n "$spec" ] && printf '%s\n' "$line" | grep -F "devbox global add ${spec}" >/dev/null; then
      return 0
    fi
    if [ "$kind" = npm ] && [ -n "$id" ] && printf '%s\n' "$line" | grep -F -- "--only ${id}" >/dev/null; then
      return 0
    fi
    if [ "$kind" = devbox ] && printf '%s\n' "$line" | grep -F 'get.jetify.com/devbox' >/dev/null; then
      return 0
    fi
  done < <(ps -eo args 2>/dev/null || true)
  return 1
}

one_line() {
  printf '%s\n' "$1" | head -n 1 | tr -d '\r"\\'
}

pkg_version() {
  local id="$1" bins="$2" bin raw
  case "$id" in
    node) raw=$(as_user 'node -v 2>/dev/null || true') ;;
    *)
      bin=${bins%%,*}
      [ -n "$bin" ] || return 0
      raw=$(as_user "$(printf '%q' "$bin") --version 2>/dev/null || true")
      ;;
  esac
  one_line "$raw"
}

mark_ok() {
  local id="$1" ver="$2"
  ver=$(one_line "$ver")
  if [ -n "$ver" ]; then
    steps+=("ok:${id}:${ver}")
  else
    steps+=("ok:${id}")
  fi
  if [ "$id" = node ]; then
    version=${ver#v}
    version=${version%%[!0-9A-Za-z._+-]*}
  fi
  write_status true "$id"
}

if command -v devbox >/dev/null 2>&1 && [ -n "$nix_bin" ]; then
  dver=$(one_line "$(as_user 'devbox version 2>/dev/null || true')")
  nver=$(one_line "$(as_user "$(printf '%q' "$nix_bin") --version 2>/dev/null || true")")
  if [ -n "$dver" ] && [ -n "$nver" ]; then
    mark_ok devbox "$dver / $nver"
  else
    mark_ok devbox "${dver}${nver}"
  fi
elif already_installing devbox "" ""; then
  mark install:devbox ""
else
  mark fail:devbox ""
fi
if [ -f "$LIST" ]; then
  while IFS=$'\t' read -r id kind spec bins; do
    [ -n "${id:-}" ] || continue
    if [ "$kind" = nix ] && [ "$id" = node ]; then
      pin=${BROS_NODE_VERSION:-26.7.0}
      pin=${pin#v}
      spec="nodejs@$pin"
    fi
    if home_mgr "$kind" && [ -n "$bins" ] && bins_ok "$bins"; then
      mark_ok "$id" "$(pkg_version "$id" "$bins")"
      continue
    fi
    if home_mgr "$kind" && already_installing "$kind" "$id" "$spec"; then
      mark "install:$id" "$id"
      continue
    fi
    if ! home_mgr "$kind"; then write_status true "$id"; fi
    if [ "$kind" = nix ]; then
      mkdir -p "$HOME_DIR/.local/share/devbox"
      chown "${PUID:-1000}:${PGID:-1000}" "$HOME_DIR/.local/share/devbox"
      mark "install:$id" "$id"
      if as_user "devbox global add $(printf '%q' "$spec")"; then
        chmod -R a+rX "$PROFILE_BIN" 2>/dev/null || true
        mark_ok "$id" "$(pkg_version "$id" "$bins")"
        continue
      fi
      if [ "$id" = node ]; then
        major=${pin%%.*}
        if as_user "devbox global add nodejs@$major"; then
          chmod -R a+rX "$PROFILE_BIN" 2>/dev/null || true
          mark_ok "$id" "$(pkg_version "$id" "$bins")"
          continue
        fi
      fi
      failures+=("$id")
      mark "fail:$id" "$id"
      continue
    fi
    if [ "$kind" = apt ] && [ -z "$bins" ]; then
      dpkg -s "$spec" >/dev/null 2>&1 && continue
    elif [ -n "$bins" ] && bins_ok "$bins"; then
      if home_mgr "$kind"; then
        mark_ok "$id" "$(pkg_version "$id" "$bins")"
      fi
      continue
    fi
    if [ "$kind" = npm ] && ! bins_ok "node,npm,npx"; then
      failures+=("$id")
      mark "fail:$id" "$id"
      continue
    fi
    if ! bins_ok "node"; then
      failures+=("$id")
      home_mgr "$kind" && mark "fail:$id" "$id"
      continue
    fi
    hash -r
    home_mgr "$kind" && mark "install:$id" "$id"
    if as_user "node $(printf '%q' "$INSTALL") --only $(printf '%q' "$id") /opt/bros/apps/ensure/packages.json"; then
      if home_mgr "$kind"; then
        mark_ok "$id" "$(pkg_version "$id" "$bins")"
      fi
    else
      failures+=("$id")
      home_mgr "$kind" && mark "fail:$id" "$id"
    fi
  done < "$LIST"
fi

if [ -f "$REMOVE" ]; then
  hash -r
  while read -r id; do
    [ -n "${id:-}" ] || continue
    write_status true "$id"
    if as_user "node $(printf '%q' "$INSTALL") --remove $(printf '%q' "$id")"; then
      rm -rf "/opt/bros/apps/ensure/remove/$id"
    else
      failures+=("$id")
    fi
  done < "$REMOVE"
  rm -f "$REMOVE"
fi

write_status false ""
