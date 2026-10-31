---
title: Apps
description: Package installs inside Desktop, and docker apps that keep their own container.
---

# Apps

An app is a package install or a docker app. Core, addon, and custom are app tiers. `/settings/desktop/apps` is the store for both. `/apps` redirects there. Package detail and docker pack detail both live here.

Add and edit package apps on `/settings/desktop/apps`. The container is [Desktop](/docs/desktop). The stream is [Desktop](/docs/desktop-gui).

## Package app and docker app

A **package app** is `lib/apps/<tier>/<id>/config.yml`, or `data/config/apps/<id>/config.yml` for a custom app. `kind: run` is a Desktop image layer. Every other enabled app installs after the Desktop session answers, one at a time, into the Desktop home. A later start skips a command that already runs. Core is always on. An addon package app installs only after Enable. Enable adds that id to `data/config/enabled-apps` and does not write a config. A custom package app is enabled when its config is written. Paperclip still installs on Start. The process runs inside container `bros` and shares `127.0.0.1` with the rest of that container.

A **docker app** is `kind: docker` in that same directory shape, plus `docker-compose.yml`. It keeps its own image and container (`bros-<id>`). Bros does not install it into the Desktop image. Desktop reaches it through a `cli` wrapper, a `gui` window, or a `webui` address. Shipped cores are Ollama and Whisper under `lib/apps/core/`. Shipped addons are under `lib/apps/addon/`. A custom one is `data/config/apps/<id>/`. Moving that directory into `lib/apps/addon/<id>/` or `lib/apps/core/<id>/` ships it. The id and the kind stay. Core docker apps boot when enabled. Other docker apps use Autostart on `/settings/desktop/apps`.

## Desktop wiring

A package `cli` shows in the compact CLI list on `/terminal` only when that app is enabled. The command is the binary on the Desktop PATH.

A package `gui` shows in the app library on `/desktop` only when that app is enabled. It shows in the Drawer when it is pinned or a window is open. A click runs `desktop-gui.sh` inside Desktop with no `--container` and opens another window. The process is the desktop user `bros` with `HOME=/home/bros`. Terminal opens `foot` in `/home/bros/workspace`. Running Drawer rows come first. Package tiles prefer `icon.png` beside the app config (keyed by app id). When that file is missing, Bros uses a desktop entry icon whose `Exec` basename matches the gui command, read via `docker exec` into container `bros` (`GET /api/desktop/drawer`, `GET /api/desktop/icons`). The gui command is still the launch line.

A package `webui` `publish` is a host port, written with app `volumes` into `config/apps-compose.yml` under Compose service `bros`. Host `bros` start/update and Desktop recreate both merge that file. Open is `http://127.0.0.1:<publish>/` on `/settings/desktop/apps` only while the app is enabled, Forward to host is on, and (when the pack has `services`) the service is running. Start the service before Open.

A package `services` entry is a `command` or a `script` beside `config.yml` in that app dir. Stdout and stderr go to `data/var/logs/apps/<id>.log`.

`bros app update <id>` updates a package app through its package manager. Check stays on the card. Update shows only after Check finds a newer version. For node, that version is the `BROS_NODE_VERSION` pin, and Check does not offer a Node newer than the pin. `kind: run` has no Check. Add and Enable queue one Rebuild. Its Update writes a force stamp and rebuilds Desktop so that curl runs again. That rebuild waits until the Desktop session answers. An addon card has Disable. That removes the id from `data/config/enabled-apps` and removes the command. Caches stay. Core has no Disable. A custom Remove uninstalls the same way. An app with a service has Logs at `/apps/<id>/logs?role=package`. The file stays after Stop.

A docker app `cli`, except a shell, gets a wrapper in `data/home/.local/app-bins`. That directory is first on the Desktop `PATH`. While the docker app is running, the wrapper is `docker compose exec` into it. While it is stopped, and `~/.local/bin/<bin>` exists on the host, the wrapper runs that host binary. Bros does not write the host PATH. Those names appear in the compact CLI list on `/terminal` when the pack is not env-disabled. The shipped docker CLI is Pi (`pi`).

A docker app `gui` shows in the app library when the pack is not env-disabled. It shows in the Drawer when it is pinned or a window is open. A click does not start the container. When the container is already running, Desktop runs `desktop-gui.sh start <id> --container <name> -- <command>`. That starts another window. It does not kill the ones already open. That `docker exec`s the command in the docker app with `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`, `XDG_RUNTIME_DIR=/home/bros/.XDG`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/home/bros/.XDG/bus`, `GDK_BACKEND=x11`, `ELECTRON_OZONE_PLATFORM_HINT=x11`, and `GTK_USE_PORTAL=1`. Package GUI starts (no `--container`) get the same env and may run `bros-portals.sh` so Electron file dialogs use the portal. Close kills the newest window. Stop kills every window for that id. The docker app stays up. The desktop stays up. 

Compose that contains `container:bros` shares Desktop's network namespace. That docker app cannot publish a host port, is not attached to network `bros`, and starts only after `bros` is up. No shipped docker app uses that namespace. A service docker app with no `gui` interface keeps its own network and stays reachable by Docker DNS.

## Tiers

**Core** — `lib/apps/core/`. Package cores always enabled. Docker cores (Ollama, Whisper) enabled by default; Whisper may be off in Settings. See [Core apps](/docs/apps/core).

**Addon** — `lib/apps/addon/<id>/config.yml`. Shipped, listed, and off until Enable. Enable records the id in `data/config/enabled-apps` and does not write a config.

**Custom** — `data/config/apps/<id>/`. Not in the repo. Same files as a shipped app. Enable flags stay outside the directory in `data/config/enabled-apps`. Moving the directory to `lib/apps/addon/<id>/` or `lib/apps/core/<id>/` ships it.

## Kinds

node, cargo, pnpm, bun, deno, and uv are the core apps. npm, pnpm, bun, deno, uv, and cargo stay the managers for a later spec of that kind. npm is a kind, not a core row. Apt, deb, nix, and run are managers too. A deno spec is `npm:name` or `jsr:name` (cache `/home/bros/.deno`). A cargo spec is `name` or `name@version` (`cargo install --locked --root /home/bros/.cargo`). There is no rustup. The core cargo app is the Nix `cargo`. Nix is a nixpkgs name (`ripgrep`) installed with `devbox global add`. A saved `nixpkgs#ripgrep` still installs. Apt is `apt-get install -y` on ensure. Base apt in `core-apt.yml` stays in the image. Deb is an https URL. A path segment `latest` is what Check compares. Run is one curl or wget command, run as written, and it is the image layer. The Nix layout is [Desktop](/docs/desktop).

## Shipped

- [Core apps](/docs/apps/core) — package cores (node, cargo, …) plus docker cores Ollama and Whisper
- [Cursor](/docs/apps/cursor) — addon, deb, CLI and window
- [Agent](/docs/apps/agent) — addon, run, `agent` and `cursor-agent`
- [Claude](/docs/apps/claude) — addon, run, `claude`
- [Paperclip](/docs/apps/paperclip) — addon, npm, web UI on **3100**
- [jq](/docs/apps/jq) — addon, apt, no CLI or window
- [OpenCode](/docs/apps/opencode) — addon, npm, web UI on **4096**



## Docker packs

Each docker app is a directory with:

- `config.yml` — `kind: docker`, identity, and interfaces
- `docker-compose.yml` — one or more services
- optional `Dockerfile`
- optional `data/` — files that mirror container paths. Before `compose up`, Bros copies each file into `$BROS_DIR/data/<id>/` when that destination is missing. Existing volume files stay.

Compose project name is `bros-<id>` on shared external Docker network `bros`. The Bros compose file uses the same network (`external: true`). The CLI creates it if missing.

Interfaces may include `webui`, `api`, `openai`, `cli`, and `gui`. `gui` is not `webui`.

A `webui` must declare `publish` in `config.yml` and map `publish:containerPort` in Compose. Open is only that published webpage. A published `api` or `openai` shows copyable host and Docker-network URLs with `basePath` (`openai` defaults to `/v1`) and has no Open button. A `cli` row shows the command (`bin`, else `command`) and no URL. CLI-only packs stay running so the network can exec them. Pi joins network `bros` when started. A fresh install does not start them. While a CLI docker app is running, Bros runs it from `data/home/.local/app-bins` on the Desktop PATH (`docker compose exec`). A `cli` or `gui` interface is available in Desktop and Terminal without a compose entry per docker app. When it is stopped and `~/.local/bin/<bin>` exists, Bros uses that host binary. The host shell always keeps a real install. Bros does not write a host PATH wrapper. Pin in nav is only for a published `webui`. A `gui` interface sets `service` and `command` and cannot set `publish`. No host port, no Pin, and no Open. Launch it from the Desktop drawer or library. That page opens and closes the window on a docker app that is already running. It does not start or stop the container. See [Desktop](/docs/desktop-gui). Optional `proxy.public: true` on a `webui` (nothing else — no mode, prefix, or baseArg) enables a Bros path proxy at `/${id}/` only when that UI natively listens under the prefix. No shipped pack sets it today (OpenCode still serves `/` and stays LAN). Every `api` and `openai` interface is proxied without `proxy.public`: `/<id><basePath>` strips `/<id>` before the upstream request (`/ollama/v1` → `http://ollama:11434/v1`). Those paths take a session or the proxy key. The allowlist is the first path segment vs a discovered docker app id, so `/opencode` does not steal `/chat` or match `/opencode-extra`. Stopped public id → 404. Dial fail → 502.

Via-tunnel Open/Pin for a public-proxy webui is same-host `/${id}/` (passkey like `/chat`). LAN Open/Pin stay `http://127.0.0.1:<publish>/`, or `http://127.0.0.1:<publish>/${id}/` when that UI listens under the path. No shipped pack opts in today. The OpenCode app is npm and serves `/`. Compose-app Bros talks to docker app APIs at `http://<service>:<containerPort>` on network `bros` (Ollama `http://ollama:11434`, Whisper `http://whisper:8000`), including when the session is via-tunnel. Host Node (`pnpm --dir app ui:dev`) uses `http://127.0.0.1:<publish>`. Do not publish host ports **3000** or **8080**. Compose env overrides (`BROS_OLLAMA_PORT`, `BROS_OPENWEBUI_PORT`, `BROS_FIRECRAWL_PORT`, `BROS_FIRECRAWL_UI_PORT`, `BROS_WHISPER_PORT`, `BROS_OPENJEV_PORT`, `BROS_OMNIROUTE_PORT`) are escape hatches for host publish / host Node.

Do **not** add extra Cloudflare hostnames. Web UI path proxy exists only for native-base UIs that opt in with `proxy.public`. API proxies use the same hostname. See [Tunnel](/docs/tunnel#docker app-uis).

## Kinds

**Core docker** — `lib/apps/core/ollama` and `lib/apps/core/whisper` (`config.yml` `kind: docker`). Ollama is always on. No Start, Stop, Restart, or Autostart on Apps / Status / Home. No disable env. `POST /api/apps/ollama/start`, `…/stop`, and `…/restart` return 400. Health restart stays internal (toast). Whisper stays stopped until Settings **Enable Whisper**. That switch pulls images, then starts the app. Off stops it and skips boot. The same pages hide Start, Stop, Restart, and Autostart. `POST /api/apps/whisper/start`, `…/stop`, and `…/restart` return 400. Desktop is not a docker app. It is the Bros container. See [Desktop](/docs/desktop).

**Addon docker** — kind `docker` under `lib/apps/addon/<id>/` (Open WebUI, Firecrawl, Firecrawl UI, OpenJEV, Pi, OmniRoute). The directory holds `config.yml` and `docker-compose.yml`. Optional. A fresh install does not start them. Autostart is SQLite and defaults off; boot honors that flag. Press Start to run one without Autostart. Env-disabled apps stay listed, do not autostart, and Start still runs them. The id stays reserved. `/desktop` opens and closes the window and does not start or stop the container. Mark disabled with `BROS_APP_OPENWEBUI=0`, `BROS_APP_FIRECRAWL=0`, `BROS_APP_FIRECRAWL_UI=0`, `BROS_APP_OPENJEV=0`, `BROS_APP_PI=0`, `BROS_APP_OMNIROUTE=0`, or `BROS_APPS_ENABLED=openwebui,firecrawl,firecrawl-ui,openjev,pi,omniroute`. Env disable does not apply to Ollama or Whisper. The OpenCode package app is npm, not this list.

**Custom** — a docker app under `data/config/apps/<id>/`. Not in the repo. Same files as a shipped docker app. Same controls as an addon. Moving that directory to `lib/apps/addon/<id>/` or `lib/apps/core/<id>/` ships it.

On `/settings/desktop/apps`, one list (docker + packages). Add, Add package, From a repo, and Scan sit above the filters. Scan results sit under the filters. Filters share one line: All / Running / Stopped, interface type (webui, api, openapi, cli, gui), and Core / Addon / Custom. Each is its own segmented control, matching All / Running / Stopped, and stays content-width. Each card heading is the name plus **(core)**, **(addon)**, **(custom)** (`data/config/apps`), or **(repo)** (git clone). Type pills sit on the title line, to the right of the name. Docker cards: Start/Stop/Restart, Open, Logs, Edit, and Update sit on the left of the action row and stay visible when the card is collapsed. Every docker card has Logs, including an app that has not created a container yet. Open is only a published web UI. The chevron stays on the right edge of that row. Autostart (non-core) and Pin in nav sit on the next line. Package cards: Enable/Disable, Start/Stop when the pack has `services`, and Open for a published `webui` only while enabled, Forward to host is on, and (when `services` exist) the service is running. Open is `http://127.0.0.1:<publish>/`. Core docker boots with Bros when enabled. Other docker Autostart is SQLite. URLs and CLI source lines are inside the panel the chevron opens. Cards do not show a host-port line. One card in the current filter uses the wide layout. Two or more stay one wide card per row until the list container is at least 48rem, then compact in two columns. A narrow list stacks even when the viewport is wide.

Discover reads:

1. `lib/apps/core/*` when `config.yml` says `kind: docker` (Ollama locked; Whisper follows Settings)
2. `lib/apps/addon/*` when `config.yml` says `kind: docker`
3. `data/config/apps/<id>/` when that directory is a docker app
4. `data/config/apps/<name>/apps/*` (git clone)

Shipped ids win. Custom cannot reuse `ollama`, `whisper`, an addon id or slug, app routes, or Popular slugs. A disabled addon still reserves its id and slug.

## Ports

`containerPort` is the process listen port inside Docker. `publish` is the host port. Bros always starts the docker app stack on that **publish** port. Start fails if the port is already taken.

Additional web UIs must set `publish` **and** stay on network `bros`.

## Add and clone

On `/settings/desktop/apps`:

- **Add app** writes `data/config/apps/<id>/` (`config.yml` with `kind: docker`, plus `docker-compose.yml`). That tree stays out of git. Editable in the UI. Saving prompts a restart confirm.
- **From a repo** clones into `data/config/apps/<name>/` and loads that tree’s `apps/` dir. Heading kind is **(repo)**. **Update** runs `git pull` and prompts restart when compose changed.
- **Scan** lists top-level global packages inside container `bros` for npm, pnpm, bun, uv, cargo, and nix. It does not write configs. A name that already matches a package app of that kind is plain text.
- **Adopt** writes `data/config/apps/<id>/config.yml` for one other name. The app is enabled. The package is already installed, so Adopt does not install it and does not write a wrapper. Adding a volume later uses package save, which recreates container `bros` when `config/apps-compose.yml` changes.



## Status

`/status` lists each docker app’s publish port, state, error, autostart, and pin. On `/settings/desktop/apps`, a refresh icon on each card re-fetches `/api/apps` so running/stopped updates without a full reload. The Dashboard **Apps** panel lists each pack’s phase (`starting`, `running`, `stopped`, `error`) and Open on a running web UI. Host Ollama is not a docker app. `/status` keeps the grouped **Bros services** list.

`bros stop` and interactive Ctrl+C stop all `bros-*` projects, then container `bros`.

Cloudflare tunnel is **not** a docker app. See [Tunnel](/docs/tunnel).

## Packages

- [Ollama](/docs/apps/ollama) — core docker, always on, publish **11435**, container 11434
- [Open WebUI](/docs/apps/openwebui) — addon docker, publish **3080** → container 8080
- [Firecrawl](/docs/apps/firecrawl) — addon docker, publish **3002** (Playwright internal)
- [Firecrawl UI](/docs/apps/firecrawl-ui) — addon docker, publish **3081** → container 8080
- [OpenJEV](/docs/apps/openjev) — addon docker, publish **8092** → container 8080, Open `/docs` (NVIDIA GPU; util 0.80 + CPU encoders by default)
- [Pi](/docs/apps/pi) — addon docker, CLI only, no host port
- [OmniRoute](/docs/apps/omniroute) — addon docker, publish **20128**, OpenAI-compatible `/v1`. Providers and combos are set in OmniRoute
- [Whisper](/docs/apps/whisper) — core docker, Settings enable (off by default), publish **8090** → container 8000 (Chat STT)
- [Desktop](/docs/desktop) — the Bros container. Stream has no host port. Terminal at `/terminal`.
- [Desktop](/docs/desktop-gui) — one Selkies stream and the Drawer, no host port
- [Custom](/docs/apps/custom) — `data/config/apps`. Not in the repo
- [Apps](/docs/apps) — package installs and the `/settings/desktop/apps` store. OpenCode is the npm app

