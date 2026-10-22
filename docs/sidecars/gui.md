---
title: Desktop
description: One Selkies stream and an Apps drawer. No host port.
---

# Desktop

`/desktop` keeps the Bros nav. One iframe shows the Selkies stream for the life of `bros-desktop`. The Apps drawer lists every sidecar `gui` interface and every package `gui` interface. A click opens the sidecar window when that sidecar is already running and does not start it. Stop kills that process. The sidecar stays up. The desktop stays up.

Package apps exec inside `bros-desktop`, so they share `127.0.0.1`. A sidecar that draws on the desktop uses that container's network namespace and does not publish a host port. No shipped sidecar takes that namespace. Start fails when `bros-desktop` is not running. Service sidecars with no `gui` interface keep their own network and stay reachable by Docker DNS. Volume `bros-x11` is `/tmp/.X11-unix`. Volume `bros-run` is `/tmp/bros-run`. Launch sets `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`, and `XDG_RUNTIME_DIR=/home/bros/.XDG`. X11 apps use XWayland.

A `gui` interface stores `command` only. It cannot set `publish`. There is no per-app iframe and no `/gui` route.

Add and remove apps on [Settings](/docs/settings) at `/settings/apps`. Those installs run in the running desktop container. See [Desktop sidecar](/docs/sidecars/desktop).

## Proxy

The browser talks only to Bros. Nitro proxies `/desktop/view/` to `http://desktop:3000` and upgrades websockets. Selkies mode is websockets. Basic auth is off. Nothing is published. The session cookie authorizes the page and the stream. The proxy key does not. Slugs `gui` and `terminal` are reserved.

Cursor and Agent are addon apps. See [Desktop sidecar](/docs/sidecars/desktop).

Hub: [Sidecars](/docs/sidecars).
