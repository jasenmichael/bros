#!/usr/bin/env bash
# Host helper: cloudflared child + files under $BROS_TUNNEL_DIR.
# The Bros container reads/writes the same dir via the /data bind mount.
set -uo pipefail

DIR="${BROS_TUNNEL_DIR:?BROS_TUNNEL_DIR required}"
PORT="${BROS_PORT:-3055}"
TARGET="http://127.0.0.1:${PORT}"
mkdir -p "$DIR"
export PATH="${HOME}/.local/bin:${PATH}"

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  printf '%s' "$s"
}

cloudflared_bin() {
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

logged_in() {
  [[ -f "${HOME}/.cloudflared/cert.pem" ]] && return 0
  local bin=""
  bin="$(cloudflared_bin)" || return 1
  "$bin" tunnel list >/dev/null 2>&1
}

cf_pid() {
  local f="${DIR}/cloudflared.pid"
  [[ -f "$f" ]] || return 1
  local pid
  pid="$(tr -d '[:space:]' <"$f")"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null || return 1
  echo "$pid"
}

NAMED_TUNNEL_NAME="${BROS_TUNNEL_NAME:-bros}"

read_public_url() {
  local public_url=""
  if [[ -n "${BROS_PUBLIC_URL:-}" ]]; then
    public_url="${BROS_PUBLIC_URL}"
  elif [[ -f "${DIR}/public_url" ]]; then
    public_url="$(head -n1 "${DIR}/public_url")"
  fi
  public_url="${public_url%"${public_url##*[![:space:]]}"}"
  public_url="${public_url#"${public_url%%[![:space:]]*}"}"
  printf '%s' "$public_url"
}

hostname_from_url() {
  local raw="$1"
  raw="${raw%"${raw##*[![:space:]]}"}"
  raw="${raw#"${raw%%[![:space:]]*}"}"
  [[ -n "$raw" ]] || return 0
  raw="${raw#http://}"
  raw="${raw#https://}"
  raw="${raw%%/*}"
  raw="${raw%%:*}"
  printf '%s' "$raw"
}

want_named_tunnel() {
  local host
  host="$(hostname_from_url "$(read_public_url)")"
  [[ -n "$host" && "$host" != *.trycloudflare.com ]]
}

routed_cname_from_output() {
  printf '%s' "$1" | grep -oE 'Added CNAME [^[:space:]]+' | awk '{print $3}' | tail -n 1 | sed 's/\.$//'
}

# 0 = account does not own the requested hostname's zone (or route landed on a different FQDN).
is_zone_ownership_failure() {
  local out="$1" requested="$2" added a r
  if printf '%s' "$out" | grep -qiE 'could not find zone|zone not found|no zone matching|does not exist|not have access|unauthorized'; then
    return 0
  fi
  added="$(routed_cname_from_output "$out")"
  if [[ -n "$added" ]]; then
    a="$(printf '%s' "$added" | tr '[:upper:]' '[:lower:]')"
    r="$(printf '%s' "$requested" | tr '[:upper:]' '[:lower:]')"
    [[ "$a" != "$r" ]]
    return
  fi
  return 1
}

ensure_named_tunnel_id() {
  local bin="$1" json id out
  json="$("$bin" tunnel list --name "$NAMED_TUNNEL_NAME" --output json 2>/dev/null || true)"
  id="$(printf '%s' "$json" | grep -oE '"id": *"[^"]+"' | head -n 1 | cut -d'"' -f4)"
  if [[ -n "$id" ]]; then
    printf '%s' "$id"
    return 0
  fi
  out="$("$bin" tunnel create "$NAMED_TUNNEL_NAME" 2>&1)" || {
    echo "Failed to create named tunnel '${NAMED_TUNNEL_NAME}': ${out}" >"${DIR}/error"
    return 1
  }
  id="$(printf '%s' "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -n 1)"
  if [[ -z "$id" ]]; then
    json="$("$bin" tunnel list --name "$NAMED_TUNNEL_NAME" --output json 2>/dev/null || true)"
    id="$(printf '%s' "$json" | grep -oE '"id": *"[^"]+"' | head -n 1 | cut -d'"' -f4)"
  fi
  if [[ -z "$id" ]]; then
    echo "Named tunnel create did not return an id. ${out}" >"${DIR}/error"
    return 1
  fi
  printf '%s' "$id"
}

write_named_config() {
  local id="$1" host="$2" cred
  cred="${HOME}/.cloudflared/${id}.json"
  if [[ ! -f "$cred" ]]; then
    echo "Missing credentials file ${cred} after tunnel create." >"${DIR}/error"
    return 1
  fi
  cat >"${DIR}/config.yml" <<EOF
tunnel: ${id}
credentials-file: ${cred}
ingress:
  - hostname: ${host}
    service: ${TARGET}
  - service: http_status:404
EOF
}

route_named_hostname() {
  local bin="$1" host="$2" out
  out="$("$bin" tunnel route dns "$NAMED_TUNNEL_NAME" "$host" 2>&1)" || true
  printf '%s\n' "$out" >>"${DIR}/logs.txt"
  if is_zone_ownership_failure "$out" "$host"; then
    echo "Cloudflare account (cloudflared login) does not own the DNS zone for ${host}. Log in to the account that owns that domain, or change public_url." >"${DIR}/error"
    return 1
  fi
  if printf '%s' "$out" | grep -qiE 'Added CNAME|already exists|already routed|CNAME already|record already'; then
    return 0
  fi
  if printf '%s' "$out" | grep -qiE 'error|failed|ERR '; then
    echo "Failed to route ${host} to named tunnel: ${out}" >"${DIR}/error"
    return 1
  fi
  return 0
}

start_named() {
  local bin="$1" host id
  host="$(hostname_from_url "$(read_public_url)")"
  if [[ -z "$host" ]]; then
    echo "public_url is set but has no hostname." >"${DIR}/error"
    return 1
  fi
  id="$(ensure_named_tunnel_id "$bin")" || return 1
  write_named_config "$id" "$host" || return 1
  route_named_hostname "$bin" "$host" || return 1
  printf '%s\n' "$host" >"${DIR}/hostname"
  : >"${DIR}/logs.txt"
  rm -f "${DIR}/error"
  nohup "$bin" tunnel --config "${DIR}/config.yml" --no-autoupdate run >>"${DIR}/logs.txt" 2>&1 &
  echo $! >"${DIR}/cloudflared.pid"
  sleep 1
  if ! cf_pid >/dev/null; then
    echo "Named tunnel exited immediately. See tunnel logs." >"${DIR}/error"
    return 1
  fi
}

parse_hostname() {
  local logs="${DIR}/logs.txt"
  [[ -f "$logs" ]] || return 1
  grep -oE 'https://[A-Za-z0-9-]+\.trycloudflare\.com' "$logs" 2>/dev/null | tail -n 1
}

rotate_logs() {
  local logs="${DIR}/logs.txt"
  [[ -f "$logs" ]] || return 0
  local lines
  lines="$(wc -l <"$logs" | tr -d ' ')"
  if [[ "${lines:-0}" -gt 500 ]]; then
    tail -n 400 "$logs" >"${logs}.tmp" && mv "${logs}.tmp" "$logs"
  fi
}

write_status() {
  local running=false pid="" hostname="" public_url="" installed=false logged=false err=""
  if pid="$(cf_pid)"; then
    running=true
  else
    pid=""
  fi
  if cloudflared_bin >/dev/null; then
    installed=true
  fi
  if logged_in; then
    logged=true
  fi
  public_url="$(read_public_url)"
  if [[ -n "$public_url" ]]; then
    hostname="$(hostname_from_url "$public_url")"
    if [[ -n "$hostname" ]]; then
      printf '%s\n' "$hostname" >"${DIR}/hostname"
    fi
  else
    if [[ -f "${DIR}/hostname" ]]; then
      hostname="$(tr -d '[:space:]' <"${DIR}/hostname")"
    fi
    local parsed=""
    parsed="$(parse_hostname || true)"
    if [[ -n "$parsed" ]]; then
      hostname="${parsed#https://}"
      printf '%s\n' "$hostname" >"${DIR}/hostname"
    fi
  fi
  if [[ -f "${DIR}/error" ]]; then
    err="$(head -c 800 "${DIR}/error")"
  fi
  if [[ "$running" == true ]]; then
    err=""
    rm -f "${DIR}/error"
  fi
  local now
  now="$(($(date +%s) * 1000))"
  cat >"${DIR}/status.json.tmp" <<EOF
{"running":${running},"pid":${pid:-null},"hostname":$(if [[ -n "$hostname" ]]; then printf '"%s"' "$(json_escape "$hostname")"; else echo null; fi),"publicUrl":$(if [[ -n "$public_url" ]]; then printf '"%s"' "$(json_escape "$public_url")"; else echo null; fi),"error":$(if [[ -n "$err" ]]; then printf '"%s"' "$(json_escape "$err")"; else echo null; fi),"installed":${installed},"loggedIn":${logged},"helper":true,"updatedAt":${now}}
EOF
  mv "${DIR}/status.json.tmp" "${DIR}/status.json"
}

start_cf() {
  local bin=""
  if ! bin="$(cloudflared_bin)"; then
    echo "cloudflared is not installed on the host. Run ./bros in a terminal to install." >"${DIR}/error"
    return 1
  fi
  if ! logged_in; then
    echo "cloudflared is not logged in. Run: cloudflared login" >"${DIR}/error"
    return 1
  fi
  if cf_pid >/dev/null; then
    if want_named_tunnel && [[ ! -f "${DIR}/config.yml" ]]; then
      stop_cf
    else
      rm -f "${DIR}/error"
      return 0
    fi
  fi
  if want_named_tunnel; then
    start_named "$bin"
    return
  fi
  : >"${DIR}/logs.txt"
  rm -f "${DIR}/error"
  nohup "$bin" tunnel --url "$TARGET" --no-autoupdate >>"${DIR}/logs.txt" 2>&1 &
  echo $! >"${DIR}/cloudflared.pid"
  sleep 1
  if ! cf_pid >/dev/null; then
    echo "cloudflared exited immediately. See tunnel logs." >"${DIR}/error"
    return 1
  fi
}

stop_cf() {
  local pid
  if pid="$(cf_pid)"; then
    kill "$pid" 2>/dev/null || true
    sleep 0.3
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "${DIR}/cloudflared.pid"
  rm -f "${DIR}/error"
}

handle_command() {
  local cmdf="${DIR}/command"
  [[ -f "$cmdf" ]] || return 0
  local cmd
  cmd="$(tr -d '[:space:]' <"$cmdf")"
  rm -f "$cmdf"
  case "$cmd" in
    start)
      printf '1\n' >"${DIR}/enabled"
      start_cf || true
      ;;
    stop)
      printf '0\n' >"${DIR}/enabled"
      stop_cf
      ;;
  esac
}

# Restart a desired-on tunnel that died (not a failed first start).
maybe_autostart() {
  [[ -f "${DIR}/enabled" && "$(tr -d '[:space:]' <"${DIR}/enabled")" == "1" ]] || return 0
  cf_pid >/dev/null && return 0
  [[ -f "${DIR}/error" ]] && return 0
  start_cf || true
}

# public_url is the enable signal at helper process start (not every loop,
# so a Dashboard stop stays off until ./bros or helper restart).
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  if [[ -n "$(read_public_url)" ]]; then
    printf '1\n' >"${DIR}/enabled"
  fi
  maybe_autostart
  while true; do
    handle_command
    maybe_autostart
    rotate_logs
    write_status
    sleep 1
  done
fi
