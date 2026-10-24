---
title: Desktop
description: One Selkies stream and a Drawer. No host port.
---

# Desktop

`/desktop` keeps the Bros nav. One iframe shows the Selkies stream for the life of `bros-desktop`. The Drawer sits at the bottom and shows on hover or touch. It lists running apps, pinned launchers, and the library icon. Running rows come first. A left click focuses a mapped window, or opens one when none is mapped. The Drawer mark follows mapped windows. A title-bar close that leaves the process is stopped once no window is mapped. A right click can unpin, open another window, or close the newest window. One app keeps one icon when several windows are open, and the count shows on the icon. The library icon opens every GUI app: Terminal, each enabled package `gui`, each sidecar `gui` that is not env-disabled, and each other desktop entry. A library click opens another window. A sidecar click does not start the sidecar. Right-click a library tile to pin it. The settings control sits at the bottom right of that panel and opens the Apps board. How a package app and a sidecar app reach this display is [Apps](/docs/apps). 

Volume `bros-x11` is `/tmp/.X11-unix`. Volume `bros-run` is `/tmp/bros-run`. X11 apps use XWayland.

A `gui` interface stores `command` only. It cannot set `publish`. There is no per-app iframe and no `/gui` route.

Desktop settings are `/settings/desktop`. The Apps section is the board: one tile per package `gui`, with Enable when that app is off. A desktop entry supplies the icon when the basename of `Exec` matches the gui command. The gui command stays the launch line. Pinning happens in the library. See [Apps](/docs/apps) and [Desktop sidecar](/docs/sidecars/desktop). 

## Proxy

The browser talks only to Bros. Nitro proxies `/desktop/view/` to `http://desktop:3000` and upgrades websockets. Selkies mode is websockets. Basic auth is off. Nothing is published. The session cookie authorizes the page and the stream. The proxy key does not. The stream follows the Bros page: it plays while `/desktop` is visible and pauses when that page is hidden. Slugs `gui` and `terminal` are reserved.

Hub: [Sidecars](/docs/sidecars).
