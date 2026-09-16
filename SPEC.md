# SPEC — Bros

**Bros** (**B**oxed **R**untime **O**rchestration **S**ystem) is a Docker-isolated local AI control plane.

## Surfaces

Chat, Models, Sidecars, Settings, Docs (from `src/layers/docs`). UI on host port **3055**.

## Docs

Shared markdown lives in repo `docs/`. Routes `/docs` come from `src/layers/docs`. The Bros app extends that layer and overrides `/` with the dashboard. Static site `src/website` extends the same layer for GitHub Pages (`baseURL` `/bros/`).

Local docs site: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ ; `pnpm docs:generate` then `pnpm --filter @bros/website preview`.

## Bootstrap

Only `working_dir` + `data_dir` in YAML:

1. `BROS_CONFIG` exclusive file, or
2. `.config/bros.yml` then `./bros.yml`
3. Env: `BROS_WORKING_DIR`, `BROS_DATA_DIR`

**`bros-dir` (host):** `BROS_DIR`. Repo checkout (CLI next to `docker-compose.yml` + `sidecars/`) uses that directory. Installed binary uses `~/.bros`. Override with `BROS_DIR`. Persistent binds live under `$BROS_DIR/data` (`BROS_HOST_DATA_DIR`):

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, custom sidecars, logs)
- `$BROS_HOST_DATA_DIR/ollama` → Ollama `/root/.ollama`
- `$BROS_HOST_DATA_DIR/openwebui` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode` → OpenCode workspace

In-container `BROS_DATA_DIR` stays `/data`. `./bros` copies leftover named volumes into empty dest dirs once (does not delete the volumes).

All other settings live in SQLite (`bros.sqlite`) and the UI.

## Sidecars

Managed Compose projects **outside** the core stack. Core packages under `sidecars/`; custom under `<data_dir>/sidecars/`. Compose project name `bros-sc-<id>` on Docker network `bros`. Web UIs proxied at `/<slug>/`, or via `hostPort` when the app cannot run under a path prefix (Open WebUI → `:3080`).

`./bros start` / `./bros --dev` remove legacy `forgebox-sc-*` containers before up. `./bros stop` and interactive Ctrl+C stop all `bros-sc-*` sidecars, then the core stack — so sidecars never stay orphaned beside a stopped app.

Keep product language **sidecar** / **Sidecars** (routes `/sidecars`, APIs `/api/sidecars`, file `sidecar.yml`).

## Auth

Shared passcode (scrypt hash in SQLite). Session cookie `bros_session`.

## Core sidecars

`ollama`, `opencode`, `openwebui`, `cloudflared`.

## Models catalog

Recommended pulls are official (and verified community) Ollama tags whose on-disk size is **≤ 16 GB**. `qwen3-coder:14b` is not a library tag (official coder is `:30b` / `:480b`); use `freehuntx/qwen3-coder:14b` or `qwen2.5-coder:14b`. 30B tags (~19 GB) stay in the Ollama list, not Recommended.

Any valid Ollama name can be typed and pulled (`name:tag` or community `owner/name:tag`). User-added names persist in the Ollama provider `config.customModels` list (SQLite via `upsertProvider`) and appear under **Yours** in the Models pull menu. Registry errors (including TLS handshake timeout) are shown as returned; one retry on timeout/5xx, never fake success.
