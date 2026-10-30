#!/bin/sh
# Session DBus + xdg-desktop-portal for native file dialogs (Electron/GTK).
# labwc autostart runs this. Safe to re-run.
set -eu
RUNTIME=${XDG_RUNTIME_DIR:-/home/bros/.XDG}
export HOME="${HOME:-/home/bros}"
export XDG_RUNTIME_DIR="$RUNTIME"
export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
mkdir -p "$RUNTIME"

if [ ! -S "$RUNTIME/bus" ]; then
  dbus-daemon --session --address="unix:path=$RUNTIME/bus" --fork >/dev/null 2>&1 || true
fi
export DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME/bus"

if [ -x /usr/local/bin/bros-gtk-theme.sh ]; then
  /usr/local/bin/bros-gtk-theme.sh || true
fi
export GTK_THEME="${GTK_THEME:-Adwaita-dark}"
export GTK_APPLICATION_PREFER_DARK_THEME=1
export ADW_DEBUG_COLOR_SCHEME="${ADW_DEBUG_COLOR_SCHEME:-prefer-dark}"

# Prefer GTK FileChooser under labwc (wlr has no chooser).
mkdir -p "$HOME/.config/xdg-desktop-portal"
conf="$HOME/.config/xdg-desktop-portal/portals.conf"
if [ ! -f "$conf" ]; then
  printf '%s\n' '[preferred]' 'default=gtk;wlr' 'org.freedesktop.impl.portal.FileChooser=gtk' > "$conf"
fi

running() {
  pgrep -u "$(id -u)" -f "$1" >/dev/null 2>&1
}

# Restart portal-gtk when theme env may have changed (still running = light Adwaita).
if [ -x /usr/libexec/xdg-desktop-portal-gtk ]; then
  if running xdg-desktop-portal-gtk; then
    if [ "${BROS_PORTAL_RESTART_GTK:-}" = 1 ]; then
      pkill -u "$(id -u)" -f '/usr/libexec/xdg-desktop-portal-gtk' >/dev/null 2>&1 || true
      sleep 0.2
    fi
  fi
  running xdg-desktop-portal-gtk || /usr/libexec/xdg-desktop-portal-gtk >/dev/null 2>&1 &
fi
if [ -x /usr/libexec/xdg-desktop-portal-wlr ]; then
  running xdg-desktop-portal-wlr || /usr/libexec/xdg-desktop-portal-wlr >/dev/null 2>&1 &
fi
if [ -x /usr/libexec/xdg-desktop-portal ]; then
  running '/usr/libexec/xdg-desktop-portal$' || /usr/libexec/xdg-desktop-portal >/dev/null 2>&1 &
fi
exit 0
