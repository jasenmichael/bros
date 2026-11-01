---
title: Status
description: App, Docker, disk, GPU, tunnel, and docker app health.
---

# Status

`/status` is the detail page. Home is a hub (chats, providers on for chat, docker app phase, tunnel) and links here for disk, Docker, and the tunnel. **Bros services** on this page lists every Bros-managed Docker container (app + each docker app compose service). Home does not render the full Status table.

## What it reports

- **Bros app** — up, service name, `BROS_HOST:BROS_PORT` (default `0.0.0.0:3055`)
- **Docker** — socket reachable
- **Disk** — data volume path and free space
- **GPU** — NVIDIA detection and VRAM when present
- **Tunnel** — host `cloudflared` running/hostname, helper up/down, installed/login, and `error`. See [Tunnel](/docs/tunnel.md)
- **Bros services** — every Docker container Bros manages: the app (`bros`) and each `bros-*` compose service (including stopped internals such as Firecrawl Redis). Grouped by pack; state + published host ports. Home does not list these containers.
- **Docker apps** — each row’s docker app publish port, state, error, autostart, pin. Port is the docker app publish (Ollama **11435**), not host Ollama. Host Ollama lives on Providers. Core Ollama and Whisper have no Start/Stop/Restart here (or on Home/Docker apps). Ollama autostart stays on. Whisper autostart follows Settings **Enable Whisper** (off by default). If Ollama crashes or its version probe fails, Bros restarts that container and `/api/status` carries `ollamaRestartNotice` for a Nuxt UI toast. Whisper is not on that health restart.

Tunnel stays stopped until host `cloudflared` is on `PATH` (or `~/.local/bin/cloudflared`) and `cloudflared login` has written `~/.cloudflared/cert.pem` (or `cloudflared tunnel list` succeeds). Missing either shows `installed no` / `login no` plus the helper error, for example `cloudflared is not installed on the host. Run ./bros in a terminal to install.` or `cloudflared is not logged in. Run: cloudflared login`.

## Via-tunnel stop lock

If the current request is via the Cloudflare tunnel, Bros will not stop the tunnel. The Dashboard toggle stays disabled, and `POST /api/tunnel/stop` returns 403 so the session cannot lock itself out. Start remains allowed.
