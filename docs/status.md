---
title: Status
description: App, Docker, disk, GPU, tunnel, and sidecar health.
---

# Status

`/status` is the detail page. Dashboard widgets (Bros, Docker, disk, GPU, Tunnel) link here. The **Ollama** widget (sidecar + host providers) links to `/providers`. **Bros services** lists every Bros-managed Docker container (app + each sidecar compose service). Sidecar rows sit in a later **Sidecar snippets** section (Status / Logs; publish port only). There is no Sidecars summary card in the widget grid. Home does not render the full Status table.

## What it reports

- **Bros app** — up, service name, host port (default 3055)
- **Docker** — socket reachable
- **Disk** — data volume path and free space
- **GPU** — NVIDIA detection and VRAM when present
- **Tunnel** — host `cloudflared` running/hostname, helper up/down, installed/login, and `error`. See [Tunnel](/docs/tunnel)
- **Bros services** — every Docker container Bros manages: the app (`bros`) and each `bros-sc-*` compose service (including stopped internals such as Firecrawl Redis). Grouped by pack; state + published host ports. Same inventory as Dashboard.
- **Sidecars** — each row’s mode, sidecar publish port, state, error, autostart, pin. Port is the sidecar publish (Ollama **11435**), not host Ollama. Host Ollama lives on Providers. Core Ollama has no Start/Stop/Restart here (or on Home/Sidecars). Autostart stays on. If the sidecar crashes or the version probe fails, Bros restarts it and `/api/status` carries `ollamaRestartNotice` for a Nuxt UI toast.

Tunnel stays stopped until host `cloudflared` is on `PATH` (or `~/.local/bin/cloudflared`) and `cloudflared login` has written `~/.cloudflared/cert.pem` (or `cloudflared tunnel list` succeeds). Missing either shows `installed no` / `login no` plus the helper error, for example `cloudflared is not installed on the host. Run ./bros in a terminal to install.` or `cloudflared is not logged in. Run: cloudflared login`.

## Via-tunnel stop lock

If the current request is via the Cloudflare tunnel, Bros will not stop the tunnel. The Dashboard toggle stays disabled, and `POST /api/tunnel/stop` returns 403 so the session cannot lock itself out. Start remains allowed.
