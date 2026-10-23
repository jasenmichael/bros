---
title: Sidecars
description: Core Ollama and Whisper, then addon sidecars from shipped packs, git clones, or lib/sidecars/custom.
---

# Sidecars

Each sidecar is a directory with:

- `sidecar.yml` — identity and interfaces
- `docker-compose.yml` — one or more services
- optional `Dockerfile`
- optional `data/` — files that mirror container paths. Before `compose up`, Bros copies each file into `$BROS_HOME/data/<id>/` when that destination is missing. Existing volume files stay.

Compose project name is `bros-sc-<id>` on shared external Docker network `bros`. Core compose uses the same network (`external: true`). The CLI creates it if missing.

Interfaces may include `webui`, `api`, `openai`, `cli`, and `gui`. `gui` is not `webui`.

A `webui` must declare `publish` in `sidecar.yml` and map `publish:containerPort` in Compose. Open is only that published webpage. A published `api` or `openai` shows copyable host and Docker-network URLs with `basePath` (`openai` defaults to `/v1`) and has no Open button. A `cli` row shows the command (`bin`, else `command`) and no URL. CLI-only packs stay running so the network can exec them. Pi joins network `bros` when started. A fresh install does not start them. While a CLI sidecar is running, Bros runs it from `data/home/.local/sidecar-bins` on the Desktop PATH (`docker compose exec`). A `cli` or `gui` interface is available in Desktop and Terminal without a compose entry per sidecar. When it is stopped and `~/.local/bin/<bin>` exists, Bros uses that host binary. The host shell always keeps a real install. Bros does not write a host PATH wrapper. Pin in nav is only for a published `webui`. A `gui` interface sets `service` and `command` and cannot set `publish`. No host port and no Pin. The card shows **Open Name** linking to `/desktop`. That page opens and closes the window on a sidecar that is already running. It does not start or stop the container. See [Desktop](/docs/sidecars/gui). Optional `proxy.public: true` on a `webui` (nothing else — no mode, prefix, or baseArg) enables a Bros path proxy at `/${id}/` only when that UI natively listens under the prefix. No shipped pack sets it today (OpenCode still serves `/` and stays LAN). Every `api` and `openai` interface is proxied without `proxy.public`: `/<id><basePath>` strips `/<id>` before the upstream request (`/ollama/v1` → `http://ollama:11434/v1`). Those paths take a session or the proxy key. The allowlist is the first path segment vs a discovered sidecar id, so `/opencode` does not steal `/chat` or match `/opencode-extra`. Stopped public id → 404. Dial fail → 502.

Via-tunnel Open/Pin for a public-proxy webui is same-host `/${id}/` (passkey like `/chat`). LAN Open/Pin stay `http://127.0.0.1:<publish>/`, or `http://127.0.0.1:<publish>/${id}/` when that UI listens under the path. No shipped pack opts in today. OpenCode 2 (`ghcr.io/anomalyco/opencode:2.0.32`) serves `/` and the Sidecars card shows its password. Compose-app Bros talks to sidecar APIs at `http://<service>:<containerPort>` on network `bros` (Ollama `http://ollama:11434`, Whisper `http://whisper:8000`), including when the session is via-tunnel. Host Node (`pnpm --dir src ui:dev`) uses `http://127.0.0.1:<publish>`. Do not publish host ports **3000** or **8080**. Compose env overrides (`BROS_OLLAMA_PORT`, `BROS_OPENCODE_PORT`, `BROS_OPENWEBUI_PORT`, `BROS_FIRECRAWL_PORT`, `BROS_FIRECRAWL_UI_PORT`, `BROS_WHISPER_PORT`, `BROS_OPENJEV_PORT`) are escape hatches for host publish / host Node.

Do **not** add extra Cloudflare hostnames. Web UI path proxy exists only for native-base UIs that opt in with `proxy.public`. API proxies use the same hostname. See [Tunnel](/docs/tunnel#sidecar-uis).

## Kinds

**Core** — `lib/sidecars/core/`. Must-run **Ollama** (`lib/sidecars/core/ollama`) is always on. No Start, Stop, Restart, or Autostart on Sidecars / Status / Home. No disable env. `POST /api/sidecars/ollama/start`, `…/stop`, and `…/restart` return 400. Health restart stays internal (toast). **Desktop** (`lib/sidecars/core/desktop`) always starts. No host port. It mounts `data/home` as `$HOME`. It does not bind another sidecar's directory. `/terminal` is its terminal. `/desktop` is the Selkies stream. `/settings/apps` installs apps from `lib/apps/<tier>/<id>/config.yml` or `data/config/apps/<id>/config.yml`. Enabled package apps install in the Desktop image build. A sidecar `cli` or `gui` shows on `/terminal` or `/desktop` when the pack is not env-disabled. A package app shows there only when enabled. Sidecar compose starts that sidecar's own process. Container start does not install, except Paperclip, which installs on Start. A `webui` publish is a host port on Desktop. Open is `http://127.0.0.1:<publish>/`. `bros app update <id>` updates a package app or a sidecar app. `bros run` and `bros shell` use this container when it is already up. Usage: [bros](/docs/cli). **Whisper** (`lib/sidecars/core/whisper`) is core and stopped until Settings **Enable Whisper**. That switch pulls images, then starts the sidecar. Off stops it and skips autostart. The same pages hide Start, Stop, Restart, and Autostart. `POST /api/sidecars/whisper/start`, `…/stop`, and `…/restart` return 400.

**Addon** — shipped packs under `lib/sidecars/addon/` (OpenCode, Open WebUI, Firecrawl, Firecrawl UI, OpenJEV, Pi). An addon can later move to core. Optional. A fresh install does not enable or start them. Autostart is SQLite and defaults off. Turn Autostart on and restart Bros, and that sidecar starts with Bros. Press Start still starts one that is off. Env-disabled packs do not start. `/desktop` opens and closes the window and does not start or stop the container. Start/Stop/Restart, autostart, logs. Mark disabled with `BROS_SIDECAR_OPENCODE=0`, `BROS_SIDECAR_OPENWEBUI=0`, `BROS_SIDECAR_FIRECRAWL=0`, `BROS_SIDECAR_FIRECRAWL_UI=0`, `BROS_SIDECAR_OPENJEV=0`, `BROS_SIDECAR_PI=0`, or `BROS_SIDECARS_DISABLE=opencode,openwebui,firecrawl,firecrawl-ui,openjev,pi`. Disabled addons stay listed. Env disable does not apply to core.

**Custom** — user-created and git-cloned under `lib/sidecars/custom`. Only `README.md` in that directory is tracked. Same controls as addons. A custom pack can later move to `lib/sidecars/addon/` or `lib/sidecars/core/`. An addon can later move to core.

On `/sidecars`, one list. Add sidecar and From a repo sit above the filters. Filters share one line: All / Running / Stopped, interface type (webui, api, openapi, cli, gui), and Core / Addon / Custom. Each is its own segmented control, matching All / Running / Stopped, and stays content-width. Each card heading is the name plus **(core)**, **(addon)**, **(custom)** (`lib/sidecars/custom`), or **(repo)** (git clone). Type pills sit on the title line, to the right of the name. Start/Stop/Restart, Open, Logs, Edit, and Update sit on the left of the action row and stay visible when the card is collapsed. Every card has Logs, including a sidecar that has not created a container yet. A gui Open is **Open Name**, to the right of Restart and before Logs. The chevron stays on the right edge of that row. Autostart (addon and custom only) and Pin in nav sit on the next line. URLs and CLI source lines are inside the panel the chevron opens. Cards do not show a “Bros sidecar on port” line. One card in the current filter uses the wide layout. Two or more stay one wide card per row until the list container is at least 48rem, then compact in two columns. A narrow list stacks even when the viewport is wide.

Discover merges:

1. `lib/sidecars/core/*` (Ollama locked; Whisper follows Settings)
2. `lib/sidecars/addon/*` (unless env-disabled)
3. `lib/sidecars/custom/<id>/` when that directory is a sidecar package
4. `lib/sidecars/custom/<name>/sidecars/*` (git clone)

Shipped ids win. Custom cannot reuse `ollama`, `whisper`, addon slugs, app routes, or Popular slugs.

## Ports

`containerPort` is the process listen port inside Docker. `publish` is the host port. Bros always starts the sidecar stack on that **publish** port. Start fails if the port is already taken.

Additional web UIs must set `publish` **and** stay on network `bros`.

## Add and clone

On `/sidecars`:

- **Add sidecar** writes `lib/sidecars/custom/<id>/` (`sidecar.yml` + `docker-compose.yml`). Pack files stay out of git. Editable in the UI. Saving prompts a restart confirm.
- **From a repo** clones into `lib/sidecars/custom/<name>/` and loads that tree’s `sidecars/` dir. Heading kind is **(repo)**. **Update** runs `git pull` and prompts restart when compose changed.

## Status

`/status` lists each sidecar’s publish port, state, error, autostart, and pin. On `/sidecars`, a refresh icon on each card re-fetches `/api/sidecars` so running/stopped updates without a full reload. The Dashboard **Sidecars** panel lists each pack’s phase (`starting`, `running`, `stopped`, `error`) and Open on a running web UI. Host Ollama is not a sidecar. `/status` keeps the grouped **Bros services** list.

`bros start` (and `BROS_DEV=1 ./bros`) remove leftover `forgebox-sc-*` containers before up. `bros stop` and interactive Ctrl+C stop all `bros-sc-*` sidecars, then the core stack.

Cloudflare tunnel is **not** a sidecar. See [Tunnel](/docs/tunnel).

## Packages

- [Ollama](/docs/sidecars/ollama) — core, always on, publish **11435**, container 11434
- [OpenCode](/docs/sidecars/opencode) — addon, publish **4097**, LAN `/` (password on the Sidecars card, no public proxy)
- [Open WebUI](/docs/sidecars/openwebui) — addon, publish **3080** → container 8080
- [Firecrawl](/docs/sidecars/firecrawl) — addon, publish **3002** (Playwright internal)
- [Firecrawl UI](/docs/sidecars/firecrawl-ui) — addon, publish **3081** → container 8080
- [OpenJEV](/docs/sidecars/openjev) — addon, publish **8092** → container 8080, Open `/docs` (NVIDIA GPU; util 0.80 + CPU encoders by default)
- [Pi](/docs/sidecars/pi) — addon, CLI only, no host port
- [Whisper](/docs/sidecars/whisper) — core, Settings enable (off by default), publish **8090** → container 8000 (Chat STT)
- [Desktop sidecar](/docs/sidecars/desktop) — core, always on, no host port, terminal at `/terminal`
- [Desktop](/docs/sidecars/gui) — one Selkies stream and the Apps drawer, no host port
- [Custom](/docs/sidecars/custom) — `lib/sidecars/custom` + git clone; only README.md is tracked
- [Apps](/docs/apps) — package installs in the Desktop image. A sidecar app stays in its own container
