#!/bin/sh
# Start or stop one GUI process on the desktop display. The desktop stays up.
set -eu
STATE=${BROS_GUI_STATE:-/tmp/bros-run/gui}
# Container DISPLAY is the unused Xorg :1. The shared desktop is XWayland :0.
DISPLAY_VALUE=:0
WAYLAND_VALUE=wayland-0
# Selkies puts the compositor socket in $HOME/.XDG, not /tmp/bros-run.
RUNTIME_VALUE=/home/bros/.XDG

usage() {
  echo "usage: desktop-gui.sh start ID [--container NAME] -- CMD [ARG...]" >&2
  echo "       desktop-gui.sh stop ID" >&2
  exit 2
}

stop_one() {
  id=$1
  dir="$STATE/$id"
  [ -f "$dir/pid" ] || return 0
  pid=$(cat "$dir/pid" 2>/dev/null || true)
  container=$(cat "$dir/container" 2>/dev/null || true)
  if [ -n "$container" ] && [ -n "$pid" ]; then
    docker exec "$container" kill "$pid" >/dev/null 2>&1 || true
  elif [ -n "$pid" ]; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
  rm -rf "$dir"
}

[ $# -ge 2 ] || usage
action=$1
id=$2
shift 2
case "$id" in
  *[!a-z0-9_-]*|'') usage ;;
esac

case "$action" in
  stop)
    stop_one "$id"
    exit 0
    ;;
  start) ;;
  *) usage ;;
esac

container=
while [ $# -gt 0 ]; do
  case "$1" in
    --container)
      container=$2
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *) usage ;;
  esac
done
[ $# -ge 1 ] || usage

stop_one "$id"
mkdir -p "$STATE/$id"
printf '%s\n' "$container" > "$STATE/$id/container"

if [ -n "$container" ]; then
  # docker exec -d dies when this script's client exits. setsid survives that.
  docker exec \
    -e "DISPLAY=${DISPLAY_VALUE}" \
    -e "WAYLAND_DISPLAY=${WAYLAND_VALUE}" \
    -e "XDG_RUNTIME_DIR=${RUNTIME_VALUE}" \
    -e BROS_GUI_LAUNCH=1 \
    "$container" \
    sh -c 'setsid sh -c "echo \$\$ > \"\$1\"; shift; exec \"\$@\"" sh "$@" </dev/null >/dev/null 2>&1 &' \
    sh "/tmp/bros-gui-${id}.pid" "$@"
  pid=
  i=0
  while [ "$i" -lt 20 ]; do
    pid=$(docker exec "$container" cat "/tmp/bros-gui-${id}.pid" 2>/dev/null || true)
    [ -n "$pid" ] && break
    i=$((i + 1))
    sleep 0.1
  done
  if [ -z "$pid" ] || ! docker exec "$container" kill -0 "$pid" >/dev/null 2>&1; then
    echo "desktop app failed to start" >&2
    exit 1
  fi
else
  log="$STATE/$id/err"
  : > "$log"
  if id abc >/dev/null 2>&1; then
    setsid runuser -u abc -- env \
      HOME=/home/bros \
      DISPLAY="$DISPLAY_VALUE" \
      WAYLAND_DISPLAY="$WAYLAND_VALUE" \
      XDG_RUNTIME_DIR="$RUNTIME_VALUE" \
      BROS_GUI_LAUNCH=1 \
      "$@" >"$log" 2>&1 &
  else
    setsid env \
      HOME=/home/bros \
      DISPLAY="$DISPLAY_VALUE" \
      WAYLAND_DISPLAY="$WAYLAND_VALUE" \
      XDG_RUNTIME_DIR="$RUNTIME_VALUE" \
      BROS_GUI_LAUNCH=1 \
      "$@" >"$log" 2>&1 &
  fi
  pid=$!
  printf '%s\n' "$pid" > "$STATE/$id/pid"
  sleep 0.4
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "desktop app failed to start" >&2
    cat "$log" >&2 || true
    exit 1
  fi
fi
if [ -n "$container" ]; then
  printf '%s\n' "$pid" > "$STATE/$id/pid"
fi
exit 0
