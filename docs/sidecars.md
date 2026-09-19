---
title: Sidecars
description: Managed Compose projects on the bros network.
---

# Sidecars

Each sidecar is a directory with:

- `sidecar.yml` — identity and interfaces
- `docker-compose.yml` — one or more services
- optional `Dockerfile`

Core sidecars ship under `sidecars/`. Custom sidecars live under `$BROS_HOST_DATA_DIR/sidecars/` (in-container `<data_dir>/sidecars/`).

Compose project name is `bros-sc-<id>` on shared external Docker network `bros`. Core compose uses the same network (`external: true`). The CLI creates it if missing.

Interfaces may include `webui`, `api`, `openai`, and `cli`.

There is **no path proxy**. A `webui` must declare `publish` in `sidecar.yml` and map `publish:containerPort` in Compose. Bros Open/Pin always opens `http://127.0.0.1:<publish>/`. Other containers keep using `http://<service>:<containerPort>` on network `bros`. Do not publish host ports **3000** or **8080**. Compose env overrides (`BROS_OLLAMA_PORT`, `BROS_OPENCODE_PORT`, `BROS_OPENWEBUI_PORT`) are escape hatches.

## Host vs sidecar

`containerPort` is the process listen port inside Docker. `publish` is the host port.

`hostMode` is stored per sidecar (`auto`, `sidecar`, `host`).

- **Auto** / **Sidecar**: `compose up` on the Bros **publish** port. Fails if that port is already taken.
- **Host**: never start the Bros sidecar stack.

Custom sidecars with a web UI must set `publish` **and** stay on network `bros`. There is no add/upload UI — drop files on disk.

## Status

`/status` lists each sidecar’s mode, port, state, error, autostart, and pin. Dashboard widgets link there (and to Logs when a container exists).

`bros start` (and `pnpm dev`) remove leftover `forgebox-sc-*` containers before up. `bros stop` and interactive Ctrl+C stop all `bros-sc-*` sidecars, then the core stack.

Cloudflare tunnel is **not** a sidecar. See [Tunnel](/docs/tunnel).

## Core and custom

- [Ollama](/docs/sidecars/ollama) — publish **11435**, container 11434
- [OpenCode](/docs/sidecars/opencode) — publish **4097**
- [Open WebUI](/docs/sidecars/openwebui) — publish **3080** → container 8080
- [Custom](/docs/sidecars/custom) — `$BROS_HOST_DATA_DIR/sidecars/<id>/`
