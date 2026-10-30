#!/bin/sh
# shortcut: only agent/version/help stay on the deb CLI, other subcommands open the GUI
case "${1:-}" in
  agent|-v|--version|-h|--help) exec /usr/bin/cursor "$@" ;;
esac
# No Chromium sandbox namespace in the container. Native Open Folder uses
# xdg-desktop-portal (GTK) when the session bus is up; Ozone stays on XWayland.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/home/bros/.XDG}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"
export GDK_BACKEND="${GDK_BACKEND:-x11}"
export ELECTRON_OZONE_PLATFORM_HINT="${ELECTRON_OZONE_PLATFORM_HINT:-x11}"
export GTK_USE_PORTAL="${GTK_USE_PORTAL:-1}"
if [ -x /usr/local/bin/bros-portals.sh ]; then
  /usr/local/bin/bros-portals.sh >/dev/null 2>&1 || true
fi
if [ -t 1 ]; then
  /usr/share/cursor/cursor --no-sandbox --ozone-platform=x11 "$@" >/dev/null 2>&1 &
  exit 0
fi
exec /usr/share/cursor/cursor --no-sandbox --ozone-platform=x11 "$@"
