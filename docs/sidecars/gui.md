---
title: Desktop
description: One Selkies stream and an Apps drawer. No host port.
---

# Desktop

`/desktop` keeps the Bros nav. One iframe shows the Selkies stream for the life of `bros-desktop`. The Apps drawer lists every sidecar `gui` interface and every package `gui` interface. A click on a sidecar row opens that window when the sidecar is already running and does not start it. Stop kills that process. The sidecar stays up. The desktop stays up. How a package app and a sidecar app reach this display is [Apps](/docs/apps).

Volume `bros-x11` is `/tmp/.X11-unix`. Volume `bros-run` is `/tmp/bros-run`. X11 apps use XWayland.

A `gui` interface stores `command` only. It cannot set `publish`. There is no per-app iframe and no `/gui` route.

Add and remove package apps on `/settings/apps`. See [Apps](/docs/apps) and [Desktop sidecar](/docs/sidecars/desktop).

## Proxy

The browser talks only to Bros. Nitro proxies `/desktop/view/` to `http://desktop:3000` and upgrades websockets. Selkies mode is websockets. Basic auth is off. Nothing is published. The session cookie authorizes the page and the stream. The proxy key does not. Slugs `gui` and `terminal` are reserved.

Hub: [Sidecars](/docs/sidecars).
