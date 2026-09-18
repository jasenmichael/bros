---
title: Status
description: App, Docker, disk, GPU, tunnel, and sidecar health.
---

# Status

`/status` is the detail page. Dashboard widgets show live snippets and link here (and to Logs when a container exists). Home does not render the full Status table.

## What it reports

- **Bros app** — up, service name, host port (default 3055)
- **Docker** — socket reachable
- **Disk** — data volume path and free space
- **GPU** — NVIDIA detection and VRAM when present
- **Tunnel** — host `cloudflared` running/hostname, helper up/down, installed/login, and `error`. See [Tunnel](/docs/tunnel)
- **Sidecars** — each row’s mode, port, state, error, autostart, pin

Tunnel stays stopped until host `cloudflared` is on `PATH` (or `~/.local/bin/cloudflared`) and `cloudflared login` has written `~/.cloudflared/cert.pem` (or `cloudflared tunnel list` succeeds). Missing either shows `installed no` / `login no` plus the helper error, for example `cloudflared is not installed on the host. Run ./bros in a terminal to install.` or `cloudflared is not logged in. Run: cloudflared login`.

## Via-tunnel stop lock

If the current request is via the Cloudflare tunnel, Bros will not stop the tunnel. The Dashboard toggle stays disabled, and `POST /api/tunnel/stop` returns 403 so the session cannot lock itself out. Start remains allowed.
