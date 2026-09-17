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

There is **no path proxy**. A `webui` must declare `publish` in `sidecar.yml` and map `publish:containerPort` in Compose. Bros Open/Pin always opens `http://127.0.0.1:<publish>/`. Other containers keep using `http://<service>:<containerPort>` on network `bros`. Do not publish host ports **3000** or **8080**. Compose env overrides (`BROS_OLLAMA_PORT`, `BROS_OPENCODE_PORT`, `BROS_OPENWEBUI_PORT`) are escape hatches.

## Host vs sidecar

`containerPort` is the process listen port inside Docker. `publish` is the host port. Ollama stays 11434 inside the container and publishes **11435** so a host Ollama on 11434 can coexist.

`hostMode` is stored per sidecar (`auto`, `sidecar`, `host`).

- **Auto** / **Sidecar**: `compose up` on the Bros **publish** port. Fails if that port is already taken. Host Ollama on 11434 does not skip the sidecar.
- **Host**: never start the Bros sidecar stack.

**Host Ollama** (Chat/Models): scan ports in `hostProbe` (`GET /api/version`). Skip `bros-sc-ollama`. Optional manual port on the Ollama sidecar card. Pick Host vs Sidecar DNS for Chat.

Custom sidecars with a web UI must set `publish` **and** stay on network `bros`.

## Status

`/status` lists each sidecar’s mode, port, state, error, autostart, and pin. Dashboard widgets link there (and to Logs when a container exists).

Core sidecars: `ollama` (Bros **11435**, host install **11434**), `opencode` (**4097**), `openwebui` (**3080** → container 8080).

Cloudflare tunnel is **not** a sidecar. The Dashboard **Tunnel** card starts/stops a host `cloudflared` process (`./bros` helper + files under `$BROS_HOST_DATA_DIR/tunnel`). `public_url` in `bros.yml` starts a named tunnel (`cloudflared tunnel route dns` + `cloudflared tunnel --config …/config.yml run bros`) for that hostname; otherwise the card uses a quick tunnel. If the current request is via-tunnel (`cf-ray`, `cf-connecting-ip`, `cf-visitor`, `cdn-loop` containing `cloudflare`, or Host matching `public_url` / `BROS_TUNNEL_HOST` / last hostname), Bros will not stop the tunnel — Dashboard toggle stays disabled, and `POST /api/tunnel/stop` returns 403.

`./bros start` / `./bros --dev` remove leftover `forgebox-sc-*` containers before up. `./bros stop` and interactive Ctrl+C stop all `bros-sc-*` sidecars, then the core stack.
