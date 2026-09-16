---
title: Sidecars
description: Managed Compose projects outside the core stack.
---

# Sidecars

Each sidecar is a directory with:

- `sidecar.yml` — identity and interfaces
- `docker-compose.yml` — one or more services
- optional `Dockerfile`

Core sidecars ship under `sidecars/`. Custom sidecars live under `$BROS_HOST_DATA_DIR/sidecars/` (in-container `<data_dir>/sidecars/`).

Compose project name is `bros-sc-<id>` on Docker network `bros`.

Interfaces may include `webui`, `api`, `openai`, and `cli`.

Web UIs are normally proxied at `/<slug>/`. Some apps (notably **Open WebUI**) hard-code root paths (`/api`, `/_app`) and cannot share Bros’ origin — set `hostPort` on the webui interface and publish that port in Compose. Bros then opens `http://<host>:<hostPort>/` (and `/<slug>/` redirects there).

Core sidecars: `ollama`, `opencode`, `openwebui` (host port **3080**), `cloudflared`.

`./bros start` / `./bros --dev` remove leftover `forgebox-sc-*` containers before up. `./bros stop` and interactive Ctrl+C stop all `bros-sc-*` sidecars, then the core stack.
