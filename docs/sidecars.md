---
title: Sidecars
description: Core Ollama, then addon sidecars from shipped packs, git clones, or the data dir.
---

# Sidecars

Each sidecar is a directory with:

- `sidecar.yml` — identity and interfaces
- `docker-compose.yml` — one or more services
- optional `Dockerfile`

Compose project name is `bros-sc-<id>` on shared external Docker network `bros`. Core compose uses the same network (`external: true`). The CLI creates it if missing.

Interfaces may include `webui`, `api`, `openai`, and `cli`.

A `webui` must declare `publish` in `sidecar.yml` and map `publish:containerPort` in Compose. A published `api` is Open the same way. Pin in nav is only for a published `webui`. Optional `proxy.public: true` on a `webui` (nothing else — no mode, prefix, or baseArg) enables a Bros path proxy at `/${id}/` only when that UI natively listens under the prefix. No shipped pack sets it today (OpenCode still serves `/`). Open WebUI and Ollama stay LAN. The allowlist is the first path segment vs a discovered sidecar id, so `/opencode` does not steal `/chat` or match `/opencode-extra`. Stopped public id → 404. Dial fail → 502.

Via-tunnel Open/Pin for a public-proxy webui is same-host `/${id}/` (passkey like `/chat`). LAN Open/Pin stay `http://127.0.0.1:<publish>/`, or `http://127.0.0.1:<publish>/${id}/` when that UI listens under the path. No shipped pack opts in today: OpenCode 1.18.30 still serves `/` (compose keeps `OPENCODE_SERVER_BASE_PATH=/opencode` for when the image honors it). Compose-app Bros talks to sidecar APIs at `http://<service>:<containerPort>` on network `bros` (Ollama `http://ollama:11434`, Whisper `http://whisper:8000`), including when the session is via-tunnel. Host Node (`pnpm app:dev`) uses `http://127.0.0.1:<publish>`. Do not publish host ports **3000** or **8080**. Compose env overrides (`BROS_OLLAMA_PORT`, `BROS_OPENCODE_PORT`, `BROS_OPENWEBUI_PORT`, `BROS_FIRECRAWL_PORT`, `BROS_FIRECRAWL_UI_PORT`, `BROS_WHISPER_PORT`) are escape hatches for host publish / host Node.

Do **not** add extra Cloudflare hostnames. Path proxy exists only for native-base UIs that opt in with `proxy.public`. See [Tunnel](/docs/tunnel#sidecar-uis).

## Kinds

**Core** — must-run **Ollama** from repo `sidecars/ollama`. Always on. No Start, Stop, Restart, or Autostart on Sidecars / Status / Home. No disable env. `POST /api/sidecars/ollama/start`, `…/stop`, and `…/restart` return 400. Health restart stays internal (toast).

**Addon** — other shipped packs under repo `sidecars/` (OpenCode, Open WebUI, Firecrawl, Firecrawl UI, Whisper). Optional and **enabled by default**. Start/Stop/Restart, autostart, logs. Disable autostart with `BROS_SIDECAR_OPENCODE=0`, `BROS_SIDECAR_OPENWEBUI=0`, `BROS_SIDECAR_FIRECRAWL=0`, `BROS_SIDECAR_FIRECRAWL_UI=0`, `BROS_SIDECAR_WHISPER=0`, or `BROS_SIDECARS_DISABLE=opencode,openwebui,firecrawl,firecrawl-ui,whisper`. Disabled addons stay listed.

**Additional** — user-created and git-cloned. Same controls as addons.

On `/sidecars`, **Core** is Ollama only. Everything else is one **Addon sidecars** list. Each card’s source badge is **bros** (shipped), **repo** (git clone), or **custom** (data dir). A section with one card uses the wide (horizontal) layout. Two or more cards stay compact in a two-column grid on large screens. Mobile is always one wide card per row.

Discover merges:

1. Core Ollama from the shipped tree (locked)
2. Shipped addons (unless env-disabled)
3. `$BROS_HOME/data/sidecars/*`
4. `$BROS_HOME/data/sidecar-repos/<name>/sidecars/*`

Shipped ids win. Custom cannot reuse `ollama`, addon slugs, app routes, or Popular slugs.

## Ports

`containerPort` is the process listen port inside Docker. `publish` is the host port. Bros always starts the sidecar stack on that **publish** port. Start fails if the port is already taken.

Additional web UIs must set `publish` **and** stay on network `bros`.

## Add and clone

On `/sidecars` → Addon sidecars:

- **Add sidecar** writes `$BROS_HOME/data/sidecars/<id>/` (`sidecar.yml` + `docker-compose.yml`). Editable in the UI. Saving prompts a restart confirm.
- **From a repo** clones into `$BROS_HOME/data/sidecar-repos/<name>/` and loads that tree’s `sidecars/` dir. Source badge is **repo**. **Update** runs `git pull` and prompts restart when compose changed.

## Status

`/status` lists each sidecar’s publish port, state, error, autostart, and pin. On `/sidecars`, a refresh icon on each card re-fetches `/api/sidecars` so running/stopped updates without a full reload. Dashboard **Bros services** lists every container in those compose projects (app `bros` plus internals). **Sidecar snippets** (below that) link to Status and Logs when a container exists. Home and Status show the sidecar publish only (Ollama **11435**). Host Ollama is not a sidecar and is not labeled on those cards. The dashboard **Ollama** card (not a Sidecars rollup) is the place for sidecar + host provider URLs. There is no Sidecars summary card in the widget grid.

`bros start` (and `pnpm dev`) remove leftover `forgebox-sc-*` containers before up. `bros stop` and interactive Ctrl+C stop all `bros-sc-*` sidecars, then the core stack.

Cloudflare tunnel is **not** a sidecar. See [Tunnel](/docs/tunnel).

## Packages

- [Ollama](/docs/sidecars/ollama) — core, publish **11435**, container 11434
- [OpenCode](/docs/sidecars/opencode) — addon, publish **4097**, LAN `/` (no public proxy until upstream base-path)
- [Open WebUI](/docs/sidecars/openwebui) — addon, publish **3080** → container 8080
- [Firecrawl](/docs/sidecars/firecrawl) — addon, publish **3002** (Playwright internal)
- [Firecrawl UI](/docs/sidecars/firecrawl-ui) — addon, publish **3081** → container 8080
- [Whisper](/docs/sidecars/whisper) — addon, publish **8090** → container 8000 (Chat STT)
- [Additional](/docs/sidecars/custom) — data dir + git clone
