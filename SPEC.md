# SPEC — Bros

**Bros** (**B**oxed **R**untime **O**rchestration **S**ystem) is a Docker-isolated local AI control plane.

## Surfaces

Chat, Models, Sidecars, Status, Settings, Docs (from `src/layers/docs`). UI on host port **3055**.

## Docs

Shared markdown lives in repo `docs/`. Routes `/docs` come from `src/layers/docs`. The Bros app extends that layer and overrides `/` with the dashboard. Static site `src/website` extends the same layer for GitHub Pages (`baseURL` `/bros/`).

Local docs site: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ ; `pnpm docs:generate` then `pnpm --filter @bros/website preview`.

## Bootstrap

`working_dir`, `data_dir`, and optional `public_url` in YAML:

1. `BROS_CONFIG` exclusive file, or
2. `.config/bros.yml` then `./bros.yml`
3. Env: `BROS_WORKING_DIR`, `BROS_DATA_DIR`, `BROS_PUBLIC_URL`

**`bros-dir` (host):** `BROS_DIR`. Repo checkout (CLI next to `docker-compose.yml` + `sidecars/`) uses that directory. Installed binary uses `~/.bros`. Override with `BROS_DIR`. Persistent binds live under `$BROS_DIR/data` (`BROS_HOST_DATA_DIR`):

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, custom sidecars, logs)
- `$BROS_HOST_DATA_DIR/ollama` → Ollama `/root/.ollama` (models)
- `$BROS_HOST_DATA_DIR/ollama-config` → Ollama `/root/.config/ollama`
- `$BROS_HOST_DATA_DIR/openwebui` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode` → OpenCode workspace
- `$BROS_HOST_DATA_DIR/opencode-config` → OpenCode `/root/.config/opencode`
- `$BROS_HOST_DATA_DIR/opencode-share` → OpenCode `/root/.local/share/opencode`

In-container `BROS_DATA_DIR` stays `/data`. `./bros` copies leftover named volumes into empty dest dirs once (does not delete the volumes).

All other settings live in SQLite (`bros.sqlite`) and the UI.

## Sidecars

Managed Compose projects **outside** the core stack. Core packages under `sidecars/`; custom under `<data_dir>/sidecars/`. Compose project name `bros-sc-<id>` on Docker network `bros`.

There is **no path proxy**. Every `webui` interface must set `hostPort` in `sidecar.yml` and publish `hostPort:targetPort` in `docker-compose.yml`. Open/Pin always use `http://127.0.0.1:<hostPort>/`. Other containers still use internal DNS `http://<service>:<targetPort>`. Host ports **3000** and **8080** are forbidden. Env overrides on Compose publish lines are escape hatches (`BROS_OLLAMA_PORT`, `BROS_OPENCODE_PORT`, `BROS_OPENWEBUI_PORT`).

`hostMode` (SQLite, default `auto`): `auto` | `sidecar` | `host`. Auto probes the host port; if something answers that is not `bros-sc-<id>`, the sidecar is host-managed and Bros does not `compose up`. Host override never starts the sidecar. Sidecar override tries start and warns if the port is taken.

`./bros start` / `./bros --dev` remove legacy `forgebox-sc-*` containers before up. `./bros stop` and interactive Ctrl+C stop all `bros-sc-*` sidecars, then the core stack — so sidecars never stay orphaned beside a stopped app.

Keep product language **sidecar** / **Sidecars** (routes `/sidecars`, APIs `/api/sidecars`, file `sidecar.yml`).

## Status

`/status` reports Bros app, Docker, disk, GPU, host Tunnel, and each sidecar’s mode/port/state/error plus autostart/pin. Dashboard widgets show live snippets and link to Status (and Logs when a container exists). Home does not render the full Status table.

Dashboard also has a **Tunnel** card for a **host** `cloudflared` process. It is not a sidecar. A non-empty `public_url` in bootstrap YAML is the enable + hostname signal: `./bros` / helper startup starts a **named** tunnel (`cloudflared tunnel create` / `route dns` / `run`) for that hostname. Quick `*.trycloudflare.com` is only used when `public_url` is unset and the card is turned on. If start fails, `status.json` `error` is shown on the Dashboard card and Status. If the logged-in Cloudflare account does not own the hostname’s DNS zone (`tunnel route dns` CNAME mismatch or zone error), the tunnel does not start and that reason is shown. Turning the card off stops the process until the next `./bros` / helper start.

A request is **via-tunnel** when any of `cf-ray`, `cf-connecting-ip`, or `cf-visitor` is present, `cdn-loop` contains `cloudflare`, or the request Host matches `public_url`, optional `BROS_TUNNEL_HOST`, or the last advertised hostname. `/api/status` includes `viaTunnel`, `tunnelHost`, and `tunnel`. While via-tunnel, stop is refused (API 403) and the Dashboard toggle is disabled so the session cannot lock itself out. Start remains allowed.

`./bros --dev` behind the tunnel must keep Vite client modules bootable. Vite serves one `.css` path as `text/css` (`<link>`) or `text/javascript` (JS import). Cloudflare caches that path (query string ignored), so a stylesheet body is reused for the module import and Nuxt never hydrates (Unlock does nothing). Dev rewrites CSS module imports to `/_nuxt/bros-mod/…*.js` and sends `CDN-Cache-Control: no-store` on Vite `/_nuxt` assets. Production hashed CSS is not affected.

## Auth

Shared passcode. Source of truth is plaintext file `{dataDir}/passkey` (in Docker: `/data/passkey`). On startup Bros creates the file if missing and prints the key to logs. Settings / setup update the file. Session cookie `bros_session` (HttpOnly, SameSite=Lax, Path=/; host-only; Secure on HTTPS including the Cloudflare tunnel, not on local HTTP). `/status` is gated like other app pages. Via-tunnel stop-lock does not apply to login.

## Core sidecars

`ollama` (host API **11434**), `opencode` (host UI **4096**), `openwebui` (host **3080** → container 8080). Cloudflare tunnel is a host `cloudflared` process, not a sidecar.

## Models catalog

Recommended pulls are official (and verified community) Ollama tags whose on-disk size is **≤ 16 GB**. `qwen3-coder:14b` is not a library tag (official coder is `:30b` / `:480b`); use `freehuntx/qwen3-coder:14b` or `qwen2.5-coder:14b`. 30B tags (~19 GB) stay in the Ollama list, not Recommended.

Any valid Ollama name can be typed and pulled (`name:tag` or community `owner/name:tag`). User-added names persist in the Ollama provider `config.customModels` list (SQLite via `upsertProvider`) and appear under **Yours** in the Models pull menu. Registry errors (including TLS handshake timeout) are shown as returned; one retry on timeout/5xx, never fake success.
