---
title: OpenCode sidecar
description: CLI coding agent with web UI on host port 4097.
---

# OpenCode sidecar

Shipped **addon** package `sidecars/opencode`. CLI coding agent with web UI (anomalyco/opencode). Enabled by default. Disable autostart with `BROS_SIDECAR_OPENCODE=0` or `BROS_SIDECARS_DISABLE=opencode`. Still listed under Addon sidecars with source **bros**.

OpenCode **1.18.30** (`ghcr.io/anomalyco/opencode`) has no base-path support. `OPENCODE_SERVER_BASE_PATH=/opencode` is set in compose for when upstream ships it (unmerged [PR 28326](https://github.com/anomalyco/opencode/pull/28326)). The running image ignores that env; `opencode web --base-path` is unknown and exits; `OPENCODE_BASE_PATH` and `server.basePath` also do nothing. The UI listens at `/` and assets stay `/assets/…`. Bros does not invent a fake prefix.

Because of that, shipped OpenCode does **not** set `proxy.public`. A `/opencode/` proxy would serve HTML whose scripts still request `/assets` on the Bros origin and 404. Re-enable `proxy.public` only after the image honors a real base path.

## Ports

- Container: **4096**
- Host publish: **4097** (`BROS_OPENCODE_PORT` override)

LAN Open/Pin: `http://127.0.0.1:4097/`. Via-tunnel Open/Pin stay that LAN URL (not same-host `/opencode/`). Pin from Sidecars to keep it in the dock.

## Binds

- `$BROS_HOST_DATA_DIR/opencode` → `/workspace`
- `$BROS_HOST_DATA_DIR/opencode-config` → `/root/.config/opencode`
- `$BROS_HOST_DATA_DIR/opencode-share` → `/root/.local/share/opencode`

Hub: [Sidecars](/docs/sidecars).
