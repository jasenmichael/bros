# SPEC — Bros

**Bros** (**B**oxed **R**untime **O**rchestration **S**ystem) is a Docker-isolated local AI control plane.

## Surfaces

Chat, Models, Sidecars, Status, Settings, Docs (from `src/layers/docs`). UI on host port **3055**.

## Chat

`/chat` is a new empty conversation (provider dropdown then model dropdown, centered greeting and composer — no left rail, no empty message well). `/chat/:id` opens a saved thread: messages fill the column and the composer docks at the bottom. User turns are visually distinct (right-aligned). The dock label is **New chat**. Previous chats sit under Status as an open, collapsible list. The bottom group is pinned sidecar UIs, then Docs + Settings, then the GitHub footer.

A conversation is created on the first send, not when opening `/chat`. After the first successful assistant reply, sidecar model **bros** writes a short title from the first user prompt (`Label:`). Later messages do not retitle. If generate fails, keep `New chat` or the first line of the prompt. The model is internal (not listed in Chat or Models). Recents overflow is Rename and Delete only. Each assistant message stores the `modelId` used for that request; the UI shows `ASSISTANT · <modelId>`. Older rows without a stored model omit the extra text. The assistant meta line keeps duration and token counts on the right when the provider sent them (reload uses the stored row, not the live dropdown). While a reply is in flight, the composer shows **Stop** (aborts the stream) instead of a loading send. Centered **thinking…** stays until the first assistant token or the request ends. Provider then model sit on the left of the tools row; the selected model's context size sits on the right when Ollama reports it. Assistant and user bodies render as markdown. Fenced code snippets include a copy control.

## Docs

Shared markdown lives in repo `docs/`. The docs layer (`src/layers/docs`) extends theme (`src/layers/theme`) and owns `/docs` routes. Both `@bros/app` and `@bros/website` `extends` theme and docs. Routes `/docs` and `/docs/*` are the same docs-layer pages in the app UI and the static site — the app does not override them. Theme owns layouts, CSS, and markdown visualization (nav chrome + prose); only nav links differ.

Docs index, dock, and website nav share `DOCS_NAV_TREE` (Start, App, Sidecars, Popular services, Contribute). The tree lists every `docs/` page, including Models → Ollama + Custom providers and all twelve Popular service pages. App dock **Docs** expands that tree (collapsible; hidden scrollbar). Dashboard…Status stay un-scrolled. Previous chats and Docs each scroll. Website nav is Home plus the same tree. Docs pages show breadcrumbs above the title (Docs / App / Models / Custom providers).

Website (`src/website`) owns marketing `/` and publishes to GitHub Pages (`baseURL` `/bros/`). Website nav: Home plus the docs directory tree. Landing cards: Chat, Models, Sidecars, Development. The Bros app owns dashboard `/` plus Chat, Models, Sidecars, Status, and Settings.

Local docs site: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ ; `pnpm docs:generate` then `pnpm --filter @bros/website preview`.

## Bootstrap

`working_dir`, `data_dir`, and optional `public_url` in YAML:

1. `BROS_CONFIG` exclusive file (install default `~/.config/bros.yml`), or
2. checkout `.config/bros.yml` then `./bros.yml`
3. Env: `BROS_WORKING_DIR`, `BROS_DATA_DIR`, `BROS_PUBLIC_URL`

**`BROS_HOME` (host):** repo checkout when the CLI sits next to `docker-compose.yml` + `sidecars/`. Installed clone is `~/.bros`. `BROS_DIR` is an alias. Override with `BROS_HOME` or `BROS_DIR`. Persistent binds live under `$BROS_HOME/data` (`BROS_HOST_DATA_DIR`):

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, custom sidecars, logs)
- `$BROS_HOST_DATA_DIR/ollama` → Ollama sidecar `/root/.ollama` (models)
- `$BROS_HOST_DATA_DIR/bros-model` → Ollama sidecar `/bros-model` (packaged specialist tree, read-only)
- `$BROS_HOST_DATA_DIR/ollama-config` → Ollama `/root/.config/ollama`
- `$BROS_HOST_DATA_DIR/openwebui` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode` → OpenCode workspace
- `$BROS_HOST_DATA_DIR/opencode-config` → OpenCode `/root/.config/opencode`
- `$BROS_HOST_DATA_DIR/opencode-share` → OpenCode `/root/.local/share/opencode`

In-container `BROS_DATA_DIR` stays `/data`. `bros` copies leftover named volumes into empty dest dirs once (does not delete the volumes).

All other settings live in SQLite (`bros.sqlite`) and the UI.

## Sidecars

Managed Compose projects **outside** the core stack. Core packages under `sidecars/`; custom under `<data_dir>/sidecars/`. Compose project name `bros-sc-<id>` on Docker network `bros`.

There is **no path proxy**. Every `webui` interface must set `publish` in `sidecar.yml` and map `publish:containerPort` in `docker-compose.yml`. Open/Pin always use `http://127.0.0.1:<publish>/`. Other containers still use internal DNS `http://<service>:<containerPort>`. Host **publish** ports **3000** and **8080** are forbidden. Env overrides (`BROS_OLLAMA_PORT`, `BROS_OPENCODE_PORT`, `BROS_OPENWEBUI_PORT`) are escape hatches.

`hostMode` (SQLite, default `auto`): `auto` | `sidecar` | `host`. Auto and Sidecar start the Bros stack on its **publish** port. Start fails if that publish port is already taken. Host mode never starts the sidecar. Occupancy of the upstream default (Ollama 11434) does **not** skip the Bros sidecar (publish **11435**).

**Host Ollama** (Chat/Models) is a second built-in provider (`ollama-host`), always listed even when the daemon is down. Scan `hostProbe.ports` (default 11434, 11436, 22000) with `GET /api/version`, skip `bros-sc-ollama`, optional SQLite `host_probe_port` override (no silent fallback). Sidecar Ollama stays `ollama` at DNS `http://ollama:11434` (host publish **11435**). Chat picks a provider, then a model, in order: sidecar, host, Popular services (fixed catalog), then custom. `modelId` is `providerId/model` (`ollama/llama3.2`, `ollama-host/llama3.2`, `openai/gpt-4o-mini`, `my-proxy/qwen2.5`). GPU / pull into `$BROS_HOME/data/ollama` is the sidecar; host pull/chat use the host Ollama disk (no Bros disk-fit check). Popular services and custom providers are OpenAI-compatible (base URL + optional key + model names), not a paid catalog. Keys live in SQLite only (no `OPENAI_API_KEY` env bootstrap).

`bros start` (and `pnpm dev`) remove legacy `forgebox-sc-*` containers before up. `bros stop` and interactive Ctrl+C stop all `bros-sc-*` sidecars, then the core stack — so sidecars never stay orphaned beside a stopped app. First start also brings up sidecar Ollama and installs the internal `bros` model when the packaged GGUF is present (see Internal specialist).

Keep product language **sidecar** / **Sidecars** (routes `/sidecars`, APIs `/api/sidecars`, file `sidecar.yml`).

## Status

`/status` reports Bros app, Docker, disk, GPU, host Tunnel, and each sidecar’s mode/port/state/error plus autostart/pin. Dashboard widgets show live snippets and link to Status (and Logs when a container exists). Home does not render the full Status table.

Dashboard also has a **Tunnel** card for a **host** `cloudflared` process. It is not a sidecar. A non-empty `public_url` in bootstrap YAML is the enable + hostname signal: `bros` / helper startup starts a **named** tunnel (`cloudflared tunnel create`, `cloudflared tunnel route dns <id> <hostname>` which creates a CNAME to `<id>.cfargotunnel.com`, then `cloudflared tunnel --config $BROS_HOME/data/tunnel/config.yml run bros`). `config.yml` has hostname ingress, catch-all `http_status:404`, `protocol: http2`, and `edge-ip-version: 4`. Override with `BROS_TUNNEL_PROTOCOL` (`http2` / `quic` / `auto`) and `BROS_TUNNEL_EDGE_IP_VERSION` (`4` / `6` / `auto`). Quick `*.trycloudflare.com` is only used when `public_url` is unset and the card is turned on. If start fails, `status.json` `error` is shown on the Dashboard card and Status. `route dns` “already exists” is success. If `route dns` times out on Cloudflare’s API, the named tunnel still starts and Dashboard shows the CLI warning plus the expected CNAME (not a leftover REST `PUT /zones/.../tunnels/.../routes` as the only message). If the logged-in Cloudflare account does not own the hostname’s DNS zone (`tunnel route dns` CNAME mismatch or zone error), the tunnel does not start and that reason is shown. Runtime connection errors after the last successful register (for example QUIC idle timeout) are shown even while the process is up. Turning the card off stops the process until the next `./bros` / helper start.

A request is **via-tunnel** when any of `cf-ray`, `cf-connecting-ip`, or `cf-visitor` is present, `cdn-loop` contains `cloudflare`, or the request Host matches `public_url`, optional `BROS_TUNNEL_HOST`, or the last advertised hostname. `/api/status` includes `viaTunnel`, `tunnelHost`, and `tunnel`. While via-tunnel, stop is refused (API 403) and the Dashboard toggle is disabled so the session cannot lock itself out. Start remains allowed.

`pnpm dev` behind the tunnel must keep Vite client modules bootable. Vite serves one `.css` path as `text/css` (`<link>`) or `text/javascript` (JS import). Cloudflare caches that path (query string ignored), so a stylesheet body is reused for the module import and Nuxt never hydrates (Unlock does nothing). Dev rewrites CSS module imports to `/_nuxt/bros-mod/…*.js` and sends `CDN-Cache-Control: no-store` on Vite `/_nuxt` assets. Production hashed CSS is not affected.

## Auth

Shared passcode. Source of truth is plaintext file `{dataDir}/passkey` (in Docker: `/data/passkey`). On startup Bros creates the file if missing and prints the key to logs. Settings / setup update the file. Session cookie `bros_session` (HttpOnly, SameSite=Lax, Path=/; host-only; Secure on HTTPS including the Cloudflare tunnel, not on local HTTP). `/status` is gated like other app pages. Via-tunnel stop-lock does not apply to login.

## Core sidecars

`ollama` (Bros publish **11435**, container 11434; host install stays **11434**), `opencode` (publish **4097**), `openwebui` (publish **3080** → container 8080). Cloudflare tunnel is a host `cloudflared` process, not a sidecar.

## Models catalog

Models lists **Ollama** (sidecar, then host), **Popular services** (12 always-listed OpenAI-compat cloud cards), then **Custom providers**. Sidecar, host, and popular cards always appear. Popular status is running when a key is saved, otherwise stopped (need a key). Rows show host:port (`127.0.0.1:11435` for sidecar publish, host probe/override for host, API host for popular/custom) — not the provider id — with copy and open-in-new-tab. Selecting a different Ollama card expands pull and the installed-model list on that card (the other collapses). The chevron or a second click on the already-open card collapses the panel; the card stays selected. Each provider row has a settings cog that opens a modal — GPU only in the sidecar modal, never on the page or for host/popular/custom. Popular cog is API key + optional model list (no Delete, no pull). Custom providers are OpenAI-compatible (base URL, optional key, model names); Add custom lives under that heading. Popular slugs are reserved (cannot delete, cannot reuse as a custom id). Heading is never “Paid providers”.

Recommended pulls are official (and verified community) Ollama tags whose on-disk size is **≤ 16 GB**. `qwen3-coder:14b` is not a library tag (official coder is `:30b` / `:480b`); use `freehuntx/qwen3-coder:14b` or `qwen2.5-coder:14b`. 30B tags (~19 GB) stay in the Ollama list, not Recommended.

Any valid Ollama name can be typed and pulled (`name:tag` or community `owner/name:tag`). User-added names persist in that Ollama provider's `config.customModels` list (SQLite via `upsertProvider`) and appear under **Yours** in the Models pull menu. Registry errors (including TLS handshake timeout) are shown as returned; one retry on timeout/5xx, never fake success.

OpenAI-compat Chat (`kind: openai`, popular and custom) sends `stream_options: { include_usage: true }`, reads `delta.content` or `delta.reasoning_content`, and adds OpenRouter `HTTP-Referer` + `X-Title: Bros`. Native Anthropic stream stays for leftover `kind: anthropic` rows; popular Anthropic is seeded as `kind: openai`. Remote `GET /models` runs only when a key is saved.

## Internal specialist

Packaged GGUF + Modelfile live in git submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)). When the Ollama sidecar is up (`startSidecar('ollama')` and `/api/models`), Bros `ensureInternalBrosModel` copies `models/`, `ollama/`, and `scripts/` onto `$BROS_HOST_DATA_DIR/bros-model`, bind-mounts that tree at `/bros-model:ro`, and runs `bash /bros-model/scripts/install-ollama.sh` inside `bros-sc-ollama` (`ollama create bros`). Skip if tags already have `bros` and the GGUF size/mtime stamp matches. Missing GGUF: log once, skip; chat still works.

Ollama name `bros` is reserved for the app. First skill is `Label:` chat titles (see Chat) — not the conversation chat model, not listed in Chat or Models, pull/delete returns 400. Typical model update: bump the pinned submodule, then release a new Bros version.
