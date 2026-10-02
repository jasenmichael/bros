---
title: Sidecars
description: Core Ollama and Whisper, then addon sidecars from shipped packs, git clones, or $BROS_SIDECARS_DIR.
---

# Sidecars

Each sidecar is a directory with:

- `sidecar.yml` — identity and interfaces
- `docker-compose.yml` — one or more services
- optional `Dockerfile`
- optional `data/` — files that mirror container paths. Before `compose up`, Bros copies each file into `$BROS_HOME/data/<id>/` when that destination is missing. Existing volume files stay.

Compose project name is `bros-sc-<id>` on shared external Docker network `bros`. Core compose uses the same network (`external: true`). The CLI creates it if missing.

Interfaces may include `webui`, `api`, `openai`, and `cli`.

A `webui` must declare `publish` in `sidecar.yml` and map `publish:containerPort` in Compose. Open is only that published webpage. A published `api` or `openai` shows copyable host and Docker-network URLs with `basePath` (`openai` defaults to `/v1`) and has no Open button. A `cli` row shows the command (`bin`, else `command`) and no URL. Pin in nav is only for a published `webui`. Optional `proxy.public: true` on a `webui` (nothing else — no mode, prefix, or baseArg) enables a Bros path proxy at `/${id}/` only when that UI natively listens under the prefix. No shipped pack sets it today (OpenCode still serves `/` and stays LAN). Every `api` and `openai` interface is proxied without `proxy.public`: `/<id><basePath>` strips `/<id>` before the upstream request (`/ollama/v1` → `http://ollama:11434/v1`). Those paths take a session or the proxy key. The allowlist is the first path segment vs a discovered sidecar id, so `/opencode` does not steal `/chat` or match `/opencode-extra`. Stopped public id → 404. Dial fail → 502.

Via-tunnel Open/Pin for a public-proxy webui is same-host `/${id}/` (passkey like `/chat`). LAN Open/Pin stay `http://127.0.0.1:<publish>/`, or `http://127.0.0.1:<publish>/${id}/` when that UI listens under the path. No shipped pack opts in today: OpenCode 1.18.30 still serves `/` (compose keeps `OPENCODE_SERVER_BASE_PATH=/opencode` for when the image honors it). Compose-app Bros talks to sidecar APIs at `http://<service>:<containerPort>` on network `bros` (Ollama `http://ollama:11434`, Whisper `http://whisper:8000`), including when the session is via-tunnel. Host Node (`pnpm --dir src app:dev`) uses `http://127.0.0.1:<publish>`. Do not publish host ports **3000** or **8080**. Compose env overrides (`BROS_OLLAMA_PORT`, `BROS_OPENCODE_PORT`, `BROS_OPENWEBUI_PORT`, `BROS_FIRECRAWL_PORT`, `BROS_FIRECRAWL_UI_PORT`, `BROS_WHISPER_PORT`, `BROS_OPENJEV_PORT`) are escape hatches for host publish / host Node.

Do **not** add extra Cloudflare hostnames. Web UI path proxy exists only for native-base UIs that opt in with `proxy.public`. API proxies use the same hostname. See [Tunnel](/docs/tunnel#sidecar-uis).

## Kinds

**Core** — `lib/sidecars/core/`. Must-run **Ollama** (`lib/sidecars/core/ollama`) is always on. No Start, Stop, Restart, or Autostart on Sidecars / Status / Home. No disable env. `POST /api/sidecars/ollama/start`, `…/stop`, and `…/restart` return 400. Health restart stays internal (toast). **Whisper** (`lib/sidecars/core/whisper`) is core and stopped until Settings **Enable Whisper**. That switch pulls images, then starts the sidecar. Off stops it and skips autostart. The same pages hide Start, Stop, Restart, and Autostart. `POST /api/sidecars/whisper/start`, `…/stop`, and `…/restart` return 400.

**Addon** — shipped packs under `lib/sidecars/addon/` (OpenCode, Open WebUI, Firecrawl, Firecrawl UI, OpenJEV). Optional and **enabled by default**. Start/Stop/Restart, autostart, logs. Disable autostart with `BROS_SIDECAR_OPENCODE=0`, `BROS_SIDECAR_OPENWEBUI=0`, `BROS_SIDECAR_FIRECRAWL=0`, `BROS_SIDECAR_FIRECRAWL_UI=0`, `BROS_SIDECAR_OPENJEV=0`, or `BROS_SIDECARS_DISABLE=opencode,openwebui,firecrawl,firecrawl-ui,openjev`. Disabled addons stay listed. Env disable does not apply to core.

**Additional** — user-created and git-cloned. Same controls as addons.

On `/sidecars`, **Core** is Ollama and Whisper. Everything else is one **Addon sidecars** list. Each card heading is the name plus **(core)**, **(addon)**, **(custom)** (`$BROS_SIDECARS_DIR`), or **(repo)** (git clone). Type pills show each interface type once, labeled **ui**, **api**, **openapi**, or **cli**. URL rows follow that type: webpage for **ui**, host plus Docker-network path for **api** and **openapi**, command name for **cli**. A section with one card uses the wide (horizontal) layout. Two or more cards stay one wide card per row until the section container is at least 48rem, then compact in two columns. A narrow section stacks even when the viewport is wide.

Discover merges:

1. `lib/sidecars/core/*` (Ollama locked; Whisper follows Settings)
2. `lib/sidecars/addon/*` (unless env-disabled)
3. `$BROS_SIDECARS_DIR/<id>/` when that directory is a sidecar package (default `$BROS_DIR/sidecars`)
4. `$BROS_SIDECARS_DIR/<name>/sidecars/*` (git clone)

Shipped ids win. Custom cannot reuse `ollama`, `whisper`, addon slugs, app routes, or Popular slugs.

## Ports

`containerPort` is the process listen port inside Docker. `publish` is the host port. Bros always starts the sidecar stack on that **publish** port. Start fails if the port is already taken.

Additional web UIs must set `publish` **and** stay on network `bros`.

## Add and clone

On `/sidecars` → Addon sidecars:

- **Add sidecar** writes `$BROS_SIDECARS_DIR/<id>/` (`sidecar.yml` + `docker-compose.yml`). That directory is gitignored. Editable in the UI. Saving prompts a restart confirm.
- **From a repo** clones into `$BROS_SIDECARS_DIR/<name>/` and loads that tree’s `sidecars/` dir. Heading kind is **(repo)**. **Update** runs `git pull` and prompts restart when compose changed.

## Status

`/status` lists each sidecar’s publish port, state, error, autostart, and pin. On `/sidecars`, a refresh icon on each card re-fetches `/api/sidecars` so running/stopped updates without a full reload. The Dashboard **Sidecars** panel lists each pack’s phase (`starting`, `running`, `stopped`, `error`) and Open on a running web UI. Host Ollama is not a sidecar. `/status` keeps the grouped **Bros services** list.

`bros start` (and `BROS_DEV=1 ./bros`) remove leftover `forgebox-sc-*` containers before up. `bros stop` and interactive Ctrl+C stop all `bros-sc-*` sidecars, then the core stack.

Cloudflare tunnel is **not** a sidecar. See [Tunnel](/docs/tunnel).

## Packages

- [Ollama](/docs/sidecars/ollama) — core, always on, publish **11435**, container 11434
- [OpenCode](/docs/sidecars/opencode) — addon, publish **4097**, LAN `/` (no public proxy until upstream base-path)
- [Open WebUI](/docs/sidecars/openwebui) — addon, publish **3080** → container 8080
- [Firecrawl](/docs/sidecars/firecrawl) — addon, publish **3002** (Playwright internal)
- [Firecrawl UI](/docs/sidecars/firecrawl-ui) — addon, publish **3081** → container 8080
- [OpenJEV](/docs/sidecars/openjev) — addon, publish **8092** → container 8080, Open `/docs` (NVIDIA GPU; util 0.80 + CPU encoders by default)
- [Whisper](/docs/sidecars/whisper) — core, Settings enable (off by default), publish **8090** → container 8000 (Chat STT)
- [Additional](/docs/sidecars/custom) — `$BROS_SIDECARS_DIR` + git clone; tracked starters **open-seo** (3001), **octop** (8088), **paperclip** (3100), **openhands** (8000), **omniroute** (20128), **trueforge** (8791)
