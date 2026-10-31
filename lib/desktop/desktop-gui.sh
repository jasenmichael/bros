#!/bin/sh
# Start, close, or stop GUI processes on the desktop display. One id can own many windows.
set -eu
STATE=${BROS_GUI_STATE:-/tmp/bros-run/gui}
# Container DISPLAY is the unused Xorg :1. The shared desktop is XWayland :0.
DISPLAY_VALUE=:0
WAYLAND_VALUE=wayland-0
# Selkies puts the compositor socket in $HOME/.XDG, not /tmp/bros-run.
RUNTIME_VALUE=/home/bros/.XDG
# Electron Open Folder crashes in Chromium's gtk-open path on this session.
# Keep Ozone/GDK on XWayland and route choosers through xdg-desktop-portal
# (bros-portals.sh + GTK_USE_PORTAL). Session bus lives under XDG_RUNTIME_DIR.
GDK_BACKEND_VALUE=x11
ELECTRON_OZONE_HINT_VALUE=x11
DBUS_VALUE=unix:path=${RUNTIME_VALUE}/bus
GTK_USE_PORTAL_VALUE=1

usage() {
  echo "usage: desktop-gui.sh start ID [--container NAME] -- CMD [ARG...]" >&2
  echo "       desktop-gui.sh focus ID" >&2
  echo "       desktop-gui.sh close ID" >&2
  echo "       desktop-gui.sh stop ID" >&2
  echo "       desktop-gui.sh status" >&2
  exit 2
}

pid_live() {
  pid=$1
  container=$2
  [ -n "$pid" ] || return 1
  if [ -n "$container" ]; then
    docker exec "$container" kill -0 "$pid" >/dev/null 2>&1
  else
    kill -0 "$pid" >/dev/null 2>&1
  fi
}

kill_pid() {
  pid=$1
  container=$2
  [ -n "$pid" ] || return 0
  if [ -n "$container" ]; then
    docker exec "$container" kill "$pid" >/dev/null 2>&1 || true
  else
    kill "$pid" >/dev/null 2>&1 || true
  fi
}

drop_slot() {
  n=$1
  pidf=$2
  if [ "$n" = 0 ]; then
    rm -f "$pidf"
  else
    rm -rf "$(dirname "$pidf")"
  fi
}

# Slot 0 is a leftover $STATE/$id/pid. Newer windows are $STATE/$id/w/$n/pid.
each_window() {
  id=$1
  dir="$STATE/$id"
  [ -d "$dir" ] || return 0
  if [ -f "$dir/pid" ]; then
    printf '%s %s\n' 0 "$dir/pid"
  fi
  [ -d "$dir/w" ] || return 0
  for slot in "$dir"/w/*; do
    [ -f "$slot/pid" ] || continue
    n=$(basename "$slot")
    case "$n" in
      *[!0-9]*) continue ;;
    esac
    printf '%s %s\n' "$n" "$slot/pid"
  done
}

read_windows() {
  id=$1
  dir="$STATE/$id"
  [ -d "$dir" ] || return 0
  tmp=$(mktemp)
  each_window "$id" > "$tmp" || true
  while IFS=' ' read -r n pidf || [ -n "${n:-}" ]; do
    [ -n "${n:-}" ] || continue
    [ -n "${pidf:-}" ] || continue
    printf '%s %s\n' "$n" "$pidf"
  done < "$tmp"
  rm -f "$tmp"
}

stop_one() {
  id=$1
  dir="$STATE/$id"
  [ -d "$dir" ] || return 0
  container=$(cat "$dir/container" 2>/dev/null || true)
  read_windows "$id" | while IFS=' ' read -r n pidf || [ -n "${n:-}" ]; do
    [ -n "${pidf:-}" ] || continue
    pid=$(cat "$pidf" 2>/dev/null || true)
    kill_pid "$pid" "$container"
  done
  rm -rf "$dir"
}

close_newest() {
  id=$1
  dir="$STATE/$id"
  [ -d "$dir" ] || return 0
  container=$(cat "$dir/container" 2>/dev/null || true)
  bestn=-1
  bestpid=
  bestf=
  while IFS=' ' read -r n pidf || [ -n "${n:-}" ]; do
    [ -n "${n:-}" ] || continue
    [ -n "${pidf:-}" ] || continue
    pid=$(cat "$pidf" 2>/dev/null || true)
    if pid_live "$pid" "$container"; then
      if [ "$n" -gt "$bestn" ]; then
        bestn=$n
        bestpid=$pid
        bestf=$pidf
      fi
    else
      drop_slot "$n" "$pidf"
    fi
  done <<EOF
$(read_windows "$id")
EOF
  [ "$bestn" -ge 0 ] || return 0
  kill_pid "$bestpid" "$container"
  drop_slot "$bestn" "$bestf"
}

claim_slot() {
  id=$1
  n=1
  mkdir -p "$STATE/$id/w"
  while [ "$n" -lt 1000 ]; do
    if mkdir "$STATE/$id/w/$n" 2>/dev/null; then
      printf '%s\n' "$n"
      return 0
    fi
    n=$((n + 1))
  done
  return 1
}

WIN_PY=$(dirname "$0")/desktop-win.py

py() {
  [ -f "$WIN_PY" ] || return 2
  XDG_RUNTIME_DIR="$RUNTIME_VALUE" WAYLAND_DISPLAY="$WAYLAND_VALUE" python3 "$WIN_PY" "$@"
}

# Living pids, one per line. Dead slots are dropped.
live_pids() {
  id=$1
  dir="$STATE/$id"
  container=$(cat "$dir/container" 2>/dev/null || true)
  while IFS=' ' read -r n pidf || [ -n "${n:-}" ]; do
    [ -n "${pidf:-}" ] || continue
    pid=$(cat "$pidf" 2>/dev/null || true)
    if pid_live "$pid" "$container"; then
      printf '%s\n' "$pid"
    else
      drop_slot "$n" "$pidf"
    fi
  done <<EOF
$(read_windows "$id")
EOF
}

# Mapped windows only. Live PIDs without a labwc map do not count.
# A process with no window, after one was seen, is stopped.
mapped_count() {
  id=$1
  dir="$STATE/$id"
  [ -d "$dir" ] || {
    echo 0
    return
  }
  pids=$(live_pids "$id" | tr '\n' ' ')
  words=$(printf '%s' "$pids" | wc -w | tr -d '[:space:]')
  if [ "$words" -eq 0 ]; then
    echo 0
    return
  fi
  app=$(cat "$dir/app" 2>/dev/null || true)
  if [ -z "$app" ]; then
    echo 0
    return
  fi
  code=0
  out=$(py count "$app" $pids) || code=$?
  if [ "$code" -ne 0 ]; then
    echo 0
    return
  fi
  n=$(printf '%s\n' "$out" | awk 'NR==1 { print $1 }')
  n=${n:-0}
  seen_app=$(printf '%s\n' "$out" | awk 'NR==2 { print }')
  if [ -n "$seen_app" ]; then
    printf '%s\n' "$seen_app" > "$dir/app"
  fi
  if [ "$n" -gt 0 ]; then
    touch "$dir/seen"
    echo "$n"
    return
  fi
  if [ -f "$dir/seen" ]; then
    stop_one "$id"
    echo 0
    return
  fi
  echo 0
}

status_all() {
  [ -d "$STATE" ] || return 0
  for dir in "$STATE"/*; do
    [ -d "$dir" ] || continue
    id=$(basename "$dir")
    case "$id" in
      *[!a-z0-9_-]*|'') continue ;;
    esac
    n=$(mapped_count "$id")
    [ "${n:-0}" -gt 0 ] || continue
    printf '%s %s\n' "$id" "$n"
  done
}

# 0 when a window was focused or the app is still starting. 3 when nothing is mapped.
focus_one() {
  id=$1
  dir="$STATE/$id"
  [ -d "$dir" ] || return 3
  n=$(mapped_count "$id")
  if [ "${n:-0}" -gt 0 ]; then
    app=$(cat "$dir/app" 2>/dev/null || true)
    [ -n "$app" ] || return 0
    py focus "$app" || true
    return 0
  fi
  [ -d "$dir" ] || return 3
  return 0
}

action=$1
if [ "$action" = status ]; then
  status_all
  exit 0
fi
[ $# -ge 2 ] || usage
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
  close)
    close_newest "$id"
    exit 0
    ;;
  focus)
    code=0
    focus_one "$id" || code=$?
    exit "$code"
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

mkdir -p "$STATE/$id"
printf '%s\n' "$container" > "$STATE/$id/container"
printf '%s\n' "$(basename "$1")" > "$STATE/$id/app"
n=$(claim_slot "$id") || {
  echo "desktop app failed to start" >&2
  exit 1
}
slot="$STATE/$id/w/$n"

if [ -n "$container" ]; then
  # docker exec -d dies when this script's client exits. setsid survives that.
  docker exec \
    -e "DISPLAY=${DISPLAY_VALUE}" \
    -e "WAYLAND_DISPLAY=${WAYLAND_VALUE}" \
    -e "XDG_RUNTIME_DIR=${RUNTIME_VALUE}" \
    -e "DBUS_SESSION_BUS_ADDRESS=${DBUS_VALUE}" \
    -e "GDK_BACKEND=${GDK_BACKEND_VALUE}" \
    -e "ELECTRON_OZONE_PLATFORM_HINT=${ELECTRON_OZONE_HINT_VALUE}" \
    -e "GTK_USE_PORTAL=${GTK_USE_PORTAL_VALUE}" \
    "$container" \
    sh -c 'setsid sh -c "echo \$\$ > \"\$1\"; shift; exec \"\$@\"" sh "$@" </dev/null >/dev/null 2>&1 &' \
    sh "/tmp/bros-gui-${id}-${n}.pid" "$@"
  pid=
  i=0
  while [ "$i" -lt 20 ]; do
    pid=$(docker exec "$container" cat "/tmp/bros-gui-${id}-${n}.pid" 2>/dev/null || true)
    [ -n "$pid" ] && break
    i=$((i + 1))
    sleep 0.1
  done
  if [ -z "$pid" ] || ! docker exec "$container" kill -0 "$pid" >/dev/null 2>&1; then
    echo "desktop app failed to start" >&2
    rm -rf "$slot"
    exit 1
  fi
  printf '%s\n' "$pid" > "$slot/pid"
else
  log="$slot/err"
  : > "$log"
  # Devbox bins for this child only. app-bins stays first so launch.sh wins.
  launch='eval "$(devbox global shellenv --init-hook 2>/dev/null)" || true; export PATH="/home/bros/.local/app-bins:$PATH"; export LIBGL_ALWAYS_SOFTWARE=1; export GDK_BACKEND=x11; export ELECTRON_OZONE_PLATFORM_HINT=x11; export GTK_USE_PORTAL=1; export DBUS_SESSION_BUS_ADDRESS="unix:path=/home/bros/.XDG/bus"; /usr/local/bin/bros-portals.sh >/dev/null 2>&1 || true; exec "$@"'
  if id abc >/dev/null 2>&1; then
    setsid runuser -u abc -- env \
      HOME=/home/bros \
      DISPLAY="$DISPLAY_VALUE" \
      WAYLAND_DISPLAY="$WAYLAND_VALUE" \
      XDG_RUNTIME_DIR="$RUNTIME_VALUE" \
      DBUS_SESSION_BUS_ADDRESS="$DBUS_VALUE" \
      LIBGL_ALWAYS_SOFTWARE=1 \
      GDK_BACKEND="$GDK_BACKEND_VALUE" \
      ELECTRON_OZONE_PLATFORM_HINT="$ELECTRON_OZONE_HINT_VALUE" \
      GTK_USE_PORTAL="$GTK_USE_PORTAL_VALUE" \
      bash -lc "$launch" _ "$@" >"$log" 2>&1 &
  else
    setsid env \
      HOME=/home/bros \
      DISPLAY="$DISPLAY_VALUE" \
      WAYLAND_DISPLAY="$WAYLAND_VALUE" \
      XDG_RUNTIME_DIR="$RUNTIME_VALUE" \
      DBUS_SESSION_BUS_ADDRESS="$DBUS_VALUE" \
      LIBGL_ALWAYS_SOFTWARE=1 \
      GDK_BACKEND="$GDK_BACKEND_VALUE" \
      ELECTRON_OZONE_PLATFORM_HINT="$ELECTRON_OZONE_HINT_VALUE" \
      GTK_USE_PORTAL="$GTK_USE_PORTAL_VALUE" \
      bash -lc "$launch" _ "$@" >"$log" 2>&1 &
  fi
  pid=$!
  printf '%s\n' "$pid" > "$slot/pid"
  sleep 0.4
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "desktop app failed to start" >&2
    cat "$log" >&2 || true
    rm -rf "$slot"
    exit 1
  fi
fi
exit 0
