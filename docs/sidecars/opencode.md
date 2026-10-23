---
title: OpenCode sidecar
description: CLI coding agent with web UI on host port 4097.
---

# OpenCode sidecar

Addon package `lib/sidecars/addon/opencode`. CLI coding agent with web UI (anomalyco/opencode). The app compose file defaults `BROS_SIDECAR_OPENCODE` to `0`. That env-disables the pack. It stays listed under Addon sidecars as **OpenCode (addon)** and does not start. Set `BROS_SIDECAR_OPENCODE=1` to allow Start and Autostart. `BROS_SIDECARS_DISABLE=opencode` also disables it.

Image `ghcr.io/anomalyco/opencode:2.0.32`. Command is `opencode serve` on container port **4096**. The server is password protected. The Sidecars card shows that password. `/home/bros` is an empty tmpfs so the process has a writable home. Only the binds below are stored.

OpenCode does **not** set `proxy.public`. It listens at `/`. A `/opencode/` proxy would serve HTML whose scripts still request `/assets` on the Bros origin and 404.

## Ports

- Container: **4096**
- Host publish: **4097** (`BROS_OPENCODE_PORT` override)

LAN Open/Pin: `http://127.0.0.1:4097/`. Via-tunnel Open/Pin stay that LAN URL (not same-host `/opencode/`). Pin from Sidecars to keep it in the dock.

## Binds

`$HOME` is `/home/bros`. Mounted home paths:

- `$BROS_HOST_DATA_DIR/home/.config/opencode` → `/home/bros/.config/opencode`
- `$BROS_HOST_DATA_DIR/home/.local/share/opencode` → `/home/bros/.local/share/opencode`
- `$BROS_HOST_DATA_DIR/home/.local/state/opencode` → `/home/bros/.local/state/opencode`

Hub: [Sidecars](/docs/sidecars).
