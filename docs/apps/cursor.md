---
title: Cursor
description: Addon desktop app. Off until enabled. CLI and window.
---

# Cursor

Addon app `lib/apps/addon/cursor/config.yml`. Off until Enable on `/apps`. `kind: deb`. Spec is the Linux x64 latest URL (`https://api2.cursor.sh/updates/download/golden/linux-x64-deb/cursor/latest`). The build downloads that file and `apt-get install`s it. Check follows redirects because a path segment is `latest`, and compares the resolved URL to the one saved at install.

`bin` is `cursor`.

Interfaces:

- `cli` — `cursor`
- `gui` — `cursor`

The deb supplies `cursor` and `cursor.desktop`. A window runs `cursor` with `HOME=/home/bros`. `launch.sh` beside this config is copied to `$HOME/.local/app-bins/cursor`. It adds `--no-sandbox` and `--ozone-platform=x11`, sets `GDK_BACKEND=x11`, `ELECTRON_OZONE_PLATFORM_HINT=x11`, `GTK_USE_PORTAL=1`, and the session `DBUS_SESSION_BUS_ADDRESS`, then execs `/usr/share/cursor/cursor`. The container cannot create the Chromium sandbox namespace. Native Open Folder uses `xdg-desktop-portal-gtk` (not Chromium `gtk-open`). `desktop-gui.sh` sets the same dialog env for every GUI child. labwc does not draw a title bar for Cursor, so the window keeps one set of buttons. The `gui` row shows in the app library only while Cursor is enabled, and in the Drawer when it is pinned or a window is open. The Drawer/library icon is `icon.png` beside this config. When that file is missing, Bros falls back to `cursor.desktop`. The `cli` row shows on `/terminal` in the compact CLI list when enabled.

Hub: [Apps](/docs/apps.md).
