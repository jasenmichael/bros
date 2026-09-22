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

There is **no path proxy**. A `webui` must declare `publish` in `sidecar.yml` and map `publish:containerPort` in Compose. A published `api` is Open/Pin the same way. Bros Open/Pin always opens `http://127.0.0.1:<publish>/`. Other containers keep using `http://<service>:<containerPort>` on network `bros`. Do not publish host ports **3000** or **8080**. Compose env overrides (`BROS_OLLAMA_PORT`, `BROS_OPENCODE_PORT`, `BROS_OPENWEBUI_PORT`, `BROS_FIRECRAWL_PORT`, `BROS_FIRECRAWL_UI_PORT`) are escape hatches.

## Kinds

**Core** — must-run **Ollama** from repo `sidecars/ollama`. Always on. No Start, Stop, Restart, or Autostart on Sidecars / Status / Home. No disable env. `POST /api/sidecars/ollama/start`, `…/stop`, and `…/restart` return 400. Health restart stays internal (toast).

**Addon** — other shipped packs under repo `sidecars/` (OpenCode, Open WebUI, Firecrawl, Firecrawl UI). Optional and **enabled by default**. Start/Stop/Restart, autostart, logs. Disable autostart with `BROS_SIDECAR_OPENCODE=0`, `BROS_SIDECAR_OPENWEBUI=0`, `BROS_SIDECAR_FIRECRAWL=0`, `BROS_SIDECAR_FIRECRAWL_UI=0`, or `BROS_SIDECARS_DISABLE=opencode,openwebui,firecrawl,firecrawl-ui`. Disabled addons stay listed.

**Additional** — user-created and git-cloned. Same controls as addons.

On `/sidecars`, **Core** is Ollama only. Everything else is one **Addon sidecars** list. Each card’s source badge is **bros** (shipped), **repo** (git clone), or **custom** (data dir). A section with one card uses the wide (horizontal) layout. Two or more cards stay compact in a two-column grid on large screens. Mobile is always one wide card per row.

Discover merges:

1. Core Ollama from the shipped tree (locked)
2. Shipped addons (unless env-disabled)
3. `$BROS_HOME/data/sidecars/*`
4. `$BROS_HOME/data/sidecar-repos/<name>/sidecars/*`

Shipped ids win. Custom cannot reuse `ollama`, addon slugs, app routes, or Popular slugs.

## Host vs sidecar

`containerPort` is the process listen port inside Docker. `publish` is the host port.

`hostMode` is stored per sidecar (`auto`, `sidecar`, `host`).

- **Auto** / **Sidecar**: `compose up` on the Bros **publish** port. Fails if that port is already taken.
- **Host**: never start the Bros sidecar stack, except core Ollama.

Additional web UIs must set `publish` **and** stay on network `bros`.

## Add and clone

On `/sidecars` → Addon sidecars:

- **Add sidecar** writes `$BROS_HOME/data/sidecars/<id>/` (`sidecar.yml` + `docker-compose.yml`). Editable in the UI. Saving prompts a restart confirm.
- **From a repo** clones into `$BROS_HOME/data/sidecar-repos/<name>/` and loads that tree’s `sidecars/` dir. Source badge is **repo**. **Update** runs `git pull` and prompts restart when compose changed.

## Status

`/status` lists each sidecar’s mode, sidecar publish port, state, error, autostart, and pin. On `/sidecars`, a refresh icon on each card re-fetches `/api/sidecars` so running/stopped updates without a full reload. Dashboard **Bros services** lists every container in those compose projects (app `bros` plus internals). **Sidecar snippets** (below that) link to Status and Logs when a container exists. Home and Status show the sidecar publish only (Ollama **11435**). Host Ollama is not a sidecar and is not labeled on those cards. The dashboard **Ollama** card (not a Sidecars rollup) is the place for sidecar + host provider URLs. There is no Sidecars summary card in the widget grid.

`bros start` (and `pnpm dev`) remove leftover `forgebox-sc-*` containers before up. `bros stop` and interactive Ctrl+C stop all `bros-sc-*` sidecars, then the core stack.

Cloudflare tunnel is **not** a sidecar. See [Tunnel](/docs/tunnel).

## Packages

- [Ollama](/docs/sidecars/ollama) — core, publish **11435**, container 11434
- [OpenCode](/docs/sidecars/opencode) — addon, publish **4097**
- [Open WebUI](/docs/sidecars/openwebui) — addon, publish **3080** → container 8080
- [Firecrawl](/docs/sidecars/firecrawl) — addon, publish **3002** (Playwright internal)
- [Firecrawl UI](/docs/sidecars/firecrawl-ui) — addon, publish **3081** → container 8080
- [Additional](/docs/sidecars/custom) — data dir + git clone
