#!/bin/sh
# Apply desktop background: solid color and optional image URL.
# Usage: bros-wallpaper.sh [color] [image-url]
# With no args, reads /app/data/config/desktop.json when present.
set -eu
color=${1:-}
url=${2:-}
cfg=/app/data/config/desktop.json
if [ -z "$color" ] && [ -f "$cfg" ]; then
  color=$(sed -n 's/.*"color"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$cfg" | head -1)
  url=$(sed -n 's/.*"imageUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$cfg" | head -1)
fi
color=${color:-#141a22}
export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/home/bros/.XDG}"

pkill -x swaybg 2>/dev/null || true
sleep 0.1

if ! command -v swaybg >/dev/null 2>&1; then
  exit 0
fi

if [ -n "$url" ]; then
  swaybg -c "$color" -i "$url" -m fill >/dev/null 2>&1 &
else
  swaybg -c "$color" >/dev/null 2>&1 &
fi
