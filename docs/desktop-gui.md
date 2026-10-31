---
title: Desktop
description: One Selkies stream and a Drawer.
---

# Desktop

`/desktop` keeps the Bros nav. One iframe shows the Selkies stream for the life of `bros`. The Drawer sits at the bottom and shows on hover or touch. It lists running apps, pinned launchers, and the library icon. Running rows come first. A left click focuses a mapped window, or opens one when none is mapped. The Drawer mark follows mapped windows. `desktop-gui.sh status` counts mapped windows only (live PIDs without a labwc map do not count). A title-bar close that leaves the process is stopped once no window is mapped. A right click can unpin, open another window, or close the newest window. One app keeps one icon when several windows are open, and the count shows on the icon. The library icon opens every GUI app: Terminal, each enabled package `gui`, each docker app `gui` that is not env-disabled, and each other desktop entry. The library leaves out `uxterm`, `xterm`, `footclient`, and `st`. A library click opens another window. A docker app click does not start the docker app. Right-click a library tile to pin it. A cog at the bottom right of the Apps panel opens `/apps`. How a package app and a docker app reach this display is [Apps](/docs/apps). 

Volume `bros-x11` is `/tmp/.X11-unix`. Volume `bros-run` is `/tmp/bros-run`. X11 apps use XWayland. `desktop-gui.sh` sets `GDK_BACKEND=x11`, `ELECTRON_OZONE_PLATFORM_HINT=x11`, `GTK_USE_PORTAL=1`, and `DBUS_SESSION_BUS_ADDRESS=unix:path=/home/bros/.XDG/bus` on GUI children. Electron Open Folder crashes in Chromium's native `gtk-open` path without a portal; choosers go through `xdg-desktop-portal` + `xdg-desktop-portal-gtk` (image apt in `core-apt.yml`). `bros-portals.sh` starts the session bus and portals from labwc autostart. labwc rules give `xdg-desktop-portal-gtk` (and `zenity`) `serverDecoration="no"` and `UnMaximize` so Selkies' maximize-all does not double-chrome the chooser. `bros-gtk-theme.sh` sets Adwaita dark (`gnome-themes-extra-data`) for GTK portal dialogs.

A `gui` interface stores `command` only. It cannot set `publish`. There is no per-app iframe and no `/gui` route.

Package tiles prefer `icon.png` beside the app config. When that file is missing, a desktop entry supplies the icon when the basename of `Exec` matches the gui command. Bros reads the catalog with `docker exec` into container `bros` (`GET /api/desktop/drawer`, `GET /api/desktop/icons`). The gui command stays the launch line. Pinning happens in the library. See [Apps](/docs/apps) and [Desktop](/docs/desktop). 

## Proxy

The browser talks only to the UI host. Nitro proxies `/desktop/view/` to `BROS_DESKTOP_STREAM_ORIGIN` and upgrades websockets. A host UI uses the localhost Selkies publish. Container `bros-ui` uses `http://bros:3000`. Selkies mode is websockets. Basic auth is off. The session cookie authorizes the page and the stream. The proxy key does not. The stream follows the Bros page: it plays while `/desktop` is visible and pauses when that page is hidden. Slugs `gui` and `terminal` are reserved.

Hub: [Docker apps](/docs/apps).
