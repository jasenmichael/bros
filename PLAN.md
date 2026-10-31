# PLAN — Bros

## Status

The CLI is a Rust binary. Usage is [docs/cli.md](docs/cli.md). A release install is that binary plus the Docker build tree. A source checkout is `cli/`.

Implementation through **M7** complete. Release install unpacks into `BROS_DIR`, writes `$BROS_DIR/bros.yml`, and symlinks `~/.local/bin/bros` (no build; binary from tarball). `--from-src` clones and cargo-builds. Optional systemd --user. First `bros` start ensures docker app Ollama and the internal `bros` model. Docker hot-reload is `BROS_DEV=1 ./bros`.

Product brand is **Bros**. Docker apps are Ollama and Whisper. The Bros container is the Selkies image plus the HTTP server. Host `cloudflared`, passkey sessions, and optional `proxy.public` are in the tree. The OpenCode package app is npm.

Docs markdown lives in `docs/`. App `/` is the dashboard. Website `/` is marketing. Static site is `src/website` → https://jasenmichael.github.io/bros/

## Recent (module layout)

Server and app utils group by concept when that concept already has three or more files (`providers/`, `settings/`, `chat/`, `docker-app/`). HTTP route files stay thin. `/api/models` and the `/models` page are removed. `bros` commands are in [docs/cli.md](docs/cli.md). Layout tree: [STACK.md](STACK.md).

Done:

- M0–M6
- Rename to Bros
- Host tunnel, auth, and `proxy.public`
- M7 install and runner CLI
- `/desktop`: one Selkies stream in `bros`. The Drawer sits at the bottom and shows on hover or touch. Docker app GUIs keep their own container and draw on the shared sockets. The Drawer cog opens the Apps board. Package install and config are on `/apps`.

## Milestones

1. **M0** — pnpm monorepo, theme + docs layers, app shell on :3055
2. **M1** — bootstrap config, SQLite, passcode
3. **M2** — docker app engine + Docker apps page (`publish` Open/Pin; path proxy later for `proxy.public`)
4. **M3** — shipped docker apps: core Ollama + Whisper (Whisper off until Settings); addon OpenCode + Open WebUI + Firecrawl + Firecrawl UI + OpenJEV + Pi (tunnel is host `cloudflared`, not a docker app)
5. **M4** — Providers page
6. **M5** — Chat streaming + history
7. **M6** — docs content, compose prod/dev, root docs
8. **M7** — install + runner CLI (`BROS_DIR`, `$BROS_DIR/bros.yml`, `BROS_BIN` symlink, optional systemd --user, first-start Ollama + model `bros`; `BROS_DEV=1 ./bros` for bind-mount)

## Layer chain

`docs` extends `theme`. App (`/` = dashboard) and website (`/` = marketing) extend theme + docs. `/docs` is the same layer in both; theme owns layouts and markdown visualization.

## Follow-ups (unplanned)

Not a milestone. Pick when needed:

- Tests: `/api/apps/*` handlers; auth HTTP + `01-auth` middleware; agents board / ACP / jobs API; MCP (`mcpClient` + `/api/mcp`)
- Tests: desktop ensure API/shell; desktop pins; bump/pack scripts; tunnel API; chat stream; e2e beyond `/api/health`
- Tests (low): specialist/skills/login/status/terminal page mounts; per-manager CLI; suggest API
- Custom packs live in `lib/apps/custom`. Only `README.md` there is tracked. A custom pack can later move to addon or core. An addon can later move to core.
- Desktop package managers include uv and cargo. Nix stays Devbox global, with the store in the Desktop image.
- OpenCode package app serves on host **4096** (same as container). No `proxy.public`. Server password is in the service log. Do not fake a Bros-side prefix.
- Settings: Chat prepend + assistant description are the `rules` and `personality` skills, plus paths + passkey
- No auto-migrate of pre-rename Docker volumes
- Named `bros-data` / `bros-ollama-data` / docker app volumes: leftover volumes stay unused; start does not copy them into `$BROS_DIR/data`
- Docs site: `pnpm --dir src docs:dev` → http://127.0.0.1:3056/bros/ ; generate + `pnpm --dir src --filter @bros/website preview`

## Data dir binds

Persistent docker app + app state is `$BROS_DIR/data` on the host (`./data` in a checkout, `~/.bros/data` when installed).

## Recent (M7 install)

- `install.sh` default unpacks release into `BROS_DIR` (`~/.bros`) with no cargo; `--from-src` clones and builds. Writes `$BROS_DIR/bros.yml` if missing, symlinks `~/.local/bin/bros`, optional `bros service install` (systemd --user). Checkout `scripts/build.sh` builds CLI + UI and refreshes repo-root `bros` only (not `BROS_BIN`). Release publish is CI only. Prod UI: host Node/pnpm when available, else `bros-ui` (or `--use-runner`).
- Dev compose is `BROS_DEV=1 ./bros` or `./bros --dev`. Default is production compose.
- First start starts docker app Ollama. A source checkout copies `vendor/bros-model`. A release reads `lib/apps/core/ollama/BROS_MODEL_VERSION` (`1.0.0` for product `0.0.1`) and downloads that packaged release on install and `bros update` when the local stamp is missing or older. A release tarball omits `vendor/`.

## Recent (internal specialist)

- Submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)) on a source checkout. Docker app ensure copies `models/` + `ollama/` + `scripts/` onto `$BROS_DATA_DIR/apps/ollama/bros-model` and runs `ollama create bros` inside `bros-ollama`. Name is reserved (not listed; `Label:` titles only). A release does not create model `bros` unless it is already in the Ollama store under `data/`.
- A source checkout copies `vendor/bros-model`. A release downloads the tag in `lib/apps/core/ollama/BROS_MODEL_VERSION`. `ollama create` runs inside `bros-ollama`. The next Bros merge publishes `v0.0.1`. The next bros-model merge publishes `v1.0.0`. After both tags exist, commit types bump each repo, and a bros-model version change opens a Bros minor-bump pull request.

## Recent (Chat thread)

- `/chat/:id` pins the thread (or overflowing main) to the latest turn after load.
- Assistant meta sits under the body. Whole-reply copy is stored raw markdown; snippet copy stays on `ProsePre`.
- User turns have copy + edit. Edit + resend: stop in-flight, `POST /api/chat/:id/truncate`, then stream the edited text. No extra `bros` retitle.

## Recent (Chat markdown)

- Chat message bodies use theme `.bros-prose` + `ProsePre` via `MDC` (same visualization as Docs `ContentRenderer`). No separate Tailwind `prose` stack.

## Recent (Chat send)

- Chat picker is a provider and a model. No Gateway row, no task dropdown, and no task-skill injection. A send without `provider/model`, or a stored model id `gateway`, returns 400. Titles still use docker app specialist `bros` (`Label:`). Provider and per-model Tools switches are gone. Settings has no Gateway block. `/api/gateway` is gone.

## Recent (Chat nav)


- Chat page is conversation-only. Recents live in the dock under Status (open/collapsible; Rename + Delete). Bottom block: pinned docker app UIs, then Docs (collapsible docs tree) + Settings, then GitHub. `/chat` = new; `/chat/:id` = saved. First successful reply titles via docker app specialist `bros` (`Label:`); the name is not listed in Chat or Providers.

## Recent (two Ollamas)

- Docker app YAML: `containerPort` + `publish` (Ollama host **11435**, Whisper **8090**, OpenCode **4096**, Open WebUI **3080**, Firecrawl **3002**, Firecrawl UI **3081**, OpenJEV **8092**)
- Host Ollama is its own Chat/Providers provider (`ollama-host`). Settings **Enable host Ollama** is off by default. Live scan: default **11434** first via `dockerHostCandidates()` / `127.0.0.1` (skip docker app **11435** / `bros-ollama`; app container cannot see host `/proc`), then Docker Ollama published ports (skip `bros-ollama` / **11435**), then leftover listen/published candidates. `GET /api/version` must be Ollama JSON `version`. Skip `bros-*` / **11435**. Manual `host_probe_port` override stays exclusive. `POST /api/providers/ollama-host/scan` busts the 30s cache.
- Start fails only if the Bros **publish** port is taken; host :11434 does not skip `bros-ollama`

## Recent (Docker apps UI)

- `/docker apps` is one list. Add docker app and From a repo sit above the filters. Filters share one line: All / Running / Stopped, interface type, and Core / Addon / Custom, each a segmented control. Addon and custom stay stopped on a fresh install until SQLite Autostart is on (then restart) or you press Start. Core always runs and has no Restart. Card headings: **(core)**, **(addon)**, **(custom)**, **(repo)**. Start/Stop/Restart, Open, and Logs sit on the left of the action row. The chevron stays on the right edge of that row. Autostart and Pin sit on the next line. The chevron opens URLs and the rest.
- Dashboard is a fixed hub: recent chats, providers on for Chat, docker app phase with Open on a running web UI, and the host tunnel. Attention shows only for Docker, docker app errors, stopped Ollama, low disk, or nothing ready for chat. The page renders before `GET /api/dashboard/summary`. **Bros services** stays on `/status`.

## Recent (Providers)

- Pull jobs persist in SQLite `ollama_pull_jobs`; one running pull per provider, extras queued. `POST /api/providers/:id/models/pull` returns `{ ok, job }`. Providers polls `GET /api/providers/:id/models/pull` (client-only interval after mount) and shows `UProgress` on that list row. Docker app compose sets `OLLAMA_NOPRUNE=1`.
- Provider `upsertProvider` merges partial `config` (keeps `useGpu` when later POSTs patch other keys)
- Ollama start with `useGpu` force-recreates via `docker-compose.gpu.yml`
- Every provider row has a Chat switch (SQLite `providers.enabled`). Ollama docker app + host default on; popular/custom default off until a saved key passes `GET /models` (or Ollama version probe). Off hides that provider from the Chat picker only. Installed Ollama models and popular catalog rows share a per-model Chat switch stored as `config.disabledModels` (default on). Off hides that model from that provider’s Chat picker. Ollama delete is a red ban icon with an Are you sure? confirm. Popular/custom catalog rows have no delete. Providers health badges are Ready / Need an API key / Invalid key / Unreachable, not running/stopped.
- Both Ollama cards (docker app + host) load collapsed; opening one is in-session only. GPU and host port sit in that dropdown after the model list. Popular cards use the same pattern (models, then key/name settings). No settings cog on Ollama or Popular.

## Lifecycle (`bros`)

- `bros start` / `BROS_DEV=1 ./bros`: remove leftover `bros-sc-*` containers before up; app autostart uses project `bros-<id>` only. First start also starts docker app Ollama and installs/updates the internal `bros` model. Docker app `ollama` always runs (no UI Start/Stop/Restart/autostart-off). A Nitro health plugin restarts it when the process is down, or after two failed version probes, and sets `ollamaRestartNotice` for one `useToast`. Addon packs boot when listed in `BROS_APPS_ENABLED` or SQLite Autostart is on.
- `BROS_DEV=1 ./bros` start: `compose up` (no `--build`; first run still builds if `bros:dev` is missing). Rebuild: `BROS_DEV=1 ./bros update`. Prod start stays `compose up --build`.
- `bros stop` and interactive Ctrl+C: stop all `bros-*` docker apps, then the core container, print `Bros exited.`, exit 0 (no orphan docker app stacks, no new data dirs). A second Ctrl+C exits 130.
- Optional Linux systemd --user unit: `bros service install` (`ExecStart=bros -D`)

## Host tunnel

`cloudflared` runs on the host. `bros` starts `scripts/bros-tunnel-helper.sh`, which owns the child process and files under `$BROS_DIR/data/var/tunnel`. `public_url` in bootstrap YAML is the enable + hostname signal (named tunnel + `route dns`). The container never spawns `cloudflared`. One hostname to Bros `:3055`. Docker app Open/Pin stay LAN except `proxy.public` webuis on the same host. No shipped pack opts in today. Compose-app Chat/Providers/STT use Docker DNS on network `bros`. `BROS_DEV=1 ./bros` over the tunnel serves Vite CSS-as-JS imports from `/_nuxt/bros-mod/…*.js` so Cloudflare cannot reuse a `text/css` cache entry for the Nuxt client.

## Recent (internal Docker APIs)

- Compose app reaches docker app Ollama and Whisper via Docker DNS (`docker appReachUrl`). Host publish is Open/Pin, host Node, and occupancy probes only, except `proxy.public` webuis which also reverse-proxy at `/${id}/`. `BROS_OLLAMA_PORT` applies to host Node Chat the same way `BROS_WHISPER_PORT` does for STT. `appRunsInDocker` also treats `BROS_DATA_DIR=/data` / `BROS_WORKING_DIR=/app` as in-container.


## TODO:
- [x] M14-01 Strip-prefix API proxy. Every `api` and `openai` docker app interface is reachable on the existing tunnel as `/<id><basePath>/…` with `/<id>` stripped. `/ollama/api` and `/ollama/v1` hit `http://ollama:11434`. Same mechanism for Whisper, Firecrawl, Open WebUI, and OpenJEV API ports. Webui `proxy.public` stays prefix-preserving. OpenCode stays LAN-only. Host Ollama stays a Chat provider and gets no tunnel path.
- [x] M14-02 Proxy key, separate from the passkey, in `$BROS_DIR/data/proxy-key` (mode 0600, print once, rotate in Settings). `api` and `openai` proxy paths accept a Bros session or `Authorization: Bearer <proxy-key>`. Bros `/api/*`, pages, and webui proxies stay session-only. Settings shows `https://<public host>/ollama/v1` for Cursor’s Override OpenAI Base URL.
- [x] M14-03 Agent page and the custom tool loop go away. `/chat` is the only conversation page and is one direct completion via `/api/chat`. Persona and rules stay. The gateway picker is removed (see Recent (Chat send)). OpenCode or OpenHands as the tool engine is later. Do not embed the OpenHands SDK.
- [x] M14-04 Docs for M14: SPEC, tunnel, and this plan. Public gateway API stays M12-02.
- [x] M8 data dirs: one host directory per container directory under `$BROS_DIR/data/apps/<id>/`
- [x] M9 thinking plus stop, allow pick new model and start typing for next chat.
- [x] M10 add voice to text for chat using whisper
- [x] M11 Agent page (`/agent`) shipped a capped tool loop, then M14-03 removed it. There is no `/agent` page and no tool loop. Chat is one completion.
- [x] M12-01 Gateway was a model option in Chat. Removed. The picker is a provider and a model.
- [ ] M12-02 Later. API keys, key-to-bearer exchange, public `/v1/models` and `/v1/chat/completions`, transcript stored by token plus hash of the first user message.
- [x] M12-03 Tools switches per provider, model, and Gateway were removed with the gateway picker. Chat is one completion.
- [x] M12-04 MCP client only. No MCP server. HTTP servers are stored in Settings. Chat does not call them.
- [x] M12-05 Skills. `personality` and `rules` live in `$BROS_DIR/data/config/skills`, seeded from `lib/skills/`, loaded on Chat turns only. A short rule in `data/config/assistant.md` only references those skills. `label` and `task` are seeded from `lib/skills/internal/` into `$BROS_DIR/data/skills-internal` and stay out of the catalog. Label and task calls do not include personality or house rules. A specialist model other than trained `bros` receives that internal skill in full. Other agents’ skill dirs are read-only in the catalog.
- [x] M12-06 `/chat` redirect to `/agent` was removed by M14-03. `/chat` is the conversation page. Recents stay in the dock.
- [x] M12-07 Chat still has no ACP tool loop. `/agents` talks ACP to Desktop `cursor-agent`.
- [x] M15 Agents page (`/agents`). GitHub issue board, Desktop Cursor or Claude after approval, pull request into the repo's PR base. No `/agent` route. Chat stays one completion.
- [ ] M12-08 Later. Retrain `bros` for `Task:` and a better `Label:`. Task examples are in `vendor/bros-model/data/source.jsonl`. The GGUF retrain is a bros-model release, not an app start. Task words: `chat`, `code`, `research`, `docs`, `rewrite`, `data`, `ops`, `plan`. Gateway ranks providers by availability, then cost, then tokens left, after that retrain is installed.
- [ ] M13 later. Agent roles, after a decision conversation. No catalog in this file.