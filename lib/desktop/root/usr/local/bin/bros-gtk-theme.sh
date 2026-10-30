#!/bin/sh
# Dark GTK for portal FileChooser / zenity. Matches Cursor dark chrome.
# Idempotent. Called from bros-live and bros-portals.sh.
set -eu
HOME_DIR="${HOME:-/home/bros}"
mkdir -p "$HOME_DIR/.config/gtk-3.0" "$HOME_DIR/.config/gtk-4.0"

gtk3="$HOME_DIR/.config/gtk-3.0/settings.ini"
gtk4="$HOME_DIR/.config/gtk-4.0/settings.ini"
if [ ! -f "$gtk3" ] || ! grep -q 'prefer-dark-theme=1' "$gtk3" 2>/dev/null; then
  printf '%s\n' '[Settings]' 'gtk-application-prefer-dark-theme=1' 'gtk-theme-name=Adwaita-dark' > "$gtk3"
fi
if [ ! -f "$gtk4" ] || ! grep -q 'prefer-dark-theme=1' "$gtk4" 2>/dev/null; then
  printf '%s\n' '[Settings]' 'gtk-application-prefer-dark-theme=1' 'gtk-theme-name=Adwaita' > "$gtk4"
fi

export GTK_THEME="${GTK_THEME:-Adwaita-dark}"
export GTK_APPLICATION_PREFER_DARK_THEME=1
export ADW_DEBUG_COLOR_SCHEME="${ADW_DEBUG_COLOR_SCHEME:-prefer-dark}"

if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.desktop.interface color-scheme prefer-dark >/dev/null 2>&1 || true
  gsettings set org.gnome.desktop.interface gtk-theme Adwaita-dark >/dev/null 2>&1 || true
fi
