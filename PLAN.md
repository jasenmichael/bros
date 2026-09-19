# PLAN — Bros

## Status

Implementation through **M7** complete. Install clones `BROS_HOME`, writes `~/.config/bros.yml`, and symlinks `~/.local/bin/bros`. Optional systemd --user. First `bros` start ensures sidecar Ollama and the internal `bros` model. Docker hot-reload is `pnpm dev`. See [PROGRESS.md](./PROGRESS.md).

## Milestones

1. **M0** — pnpm monorepo, theme + docs layers, app shell on :3055
2. **M1** — bootstrap config, SQLite, passcode
3. **M2** — sidecar engine + Sidecars page (`publish` Open/Pin; no path proxy)
4. **M3** — core sidecars: ollama, opencode, openwebui (tunnel is host `cloudflared`, not a sidecar)
5. **M4** — Models page
6. **M5** — Chat streaming + history
7. **M6** — docs content, compose prod/dev, root docs
8. **M7** — install + runner CLI (`BROS_HOME`, `~/.config/bros.yml`, `BROS_BIN` symlink, optional systemd --user, first-start Ollama + model `bros`; `pnpm dev` for bind-mount)

## Layer chain

`docs` extends `theme`. App (`/` = dashboard) and website (`/` = marketing) extend theme + docs. `/docs` is the same layer in both; theme owns layouts and markdown visualization.

## Follow-ups (unplanned)

Not a milestone. Pick when needed:

- CI: add test + typecheck jobs (Pages workflow only today)
- Tests: chat stream coverage; e2e beyond `/api/health`
- Custom sidecars: drop-in `$dataDir/sidecars` works; no add/upload UI
- Settings: paths + passkey only
- No auto-migrate of pre-rename Docker volumes
- Named `bros-data` / `bros-ollama-data` / sidecar volumes: leftover volumes stay unused; start does not copy them into `$BROS_HOME/data`
- Docs site: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ ; generate + `pnpm --filter @bros/website preview`

## Data dir binds

Persistent sidecar + app state is `$BROS_HOME/data` on the host (`./data` in a checkout, `~/.bros/data` when installed).

## Recent (M7 install)

- `install.sh` clones `BROS_HOME` (`~/.bros`), writes `~/.config/bros.yml` if missing, symlinks `~/.local/bin/bros`, optional `bros service install` (systemd --user)
- `bros` is production compose only; `--dev` removed. Docker bind-mount is `pnpm dev` (`BROS_DEV=1`)
- First start starts sidecar Ollama and installs/updates internal model `bros` from `vendor/bros-model`

## Recent (internal specialist)

- Submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)). Sidecar ensure copies `models/` + `ollama/` + `scripts/` onto `$BROS_HOST_DATA_DIR/bros-model` and runs `ollama create bros` inside `bros-sc-ollama`. Name is reserved (not listed; `Label:` titles only).
- Model updates: bump the pinned submodule to the new bros-model tag/commit, then release a new Bros version. Checkout: `git submodule update --remote` (or pin a SHA) + `./bros update` when the GGUF size/mtime stamp differs. Do not treat host `ollama create` as the operator path.

## Recent (Chat nav)


- Chat page is conversation-only. Recents live in the dock under Status (open/collapsible; Rename + Delete). Bottom block: pinned sidecar UIs, then Docs (collapsible docs tree) + Settings, then GitHub. `/chat` = new; `/chat/:id` = saved. First successful reply titles via sidecar specialist `bros` (`Label:`); the name is not listed in Chat or Models.

## Recent (two Ollamas)

- Sidecar YAML: `containerPort` + `publish` (Ollama host **11435**, OpenCode **4097**, Open WebUI **3080**)
- Host Ollama is its own Chat/Models provider (`ollama-host`; scan 11434/11436/22000 + `GET /api/version`, skip `bros-sc-ollama`)
- Start fails only if the Bros **publish** port is taken; host :11434 does not skip `bros-sc-ollama`

## Recent (Models)

- Pull streams NDJSON progress into Models UI (`UProgress`)
- Provider `upsertProvider` merges partial `config` (keeps `useGpu` when later POSTs patch other keys)
- Ollama start with `useGpu` force-recreates via `docker-compose.gpu.yml`

## Lifecycle (`bros`)

- `bros start` / `pnpm dev`: remove legacy `forgebox-sc-*` containers before up; app autostart uses project `bros-sc-<id>` only. First start also starts sidecar Ollama and installs/updates the internal `bros` model.
- `pnpm dev` start: `compose up` (no `--build`; first run still builds if `bros:dev` is missing). Rebuild: `pnpm dev:update`. Prod start stays `compose up --build`.
- `bros stop` and interactive Ctrl+C: stop all `bros-sc-*` sidecars, then core compose down (no orphan sidecar stacks)
- Optional Linux systemd --user unit: `bros service install` (`ExecStart=bros -D`)

## Host tunnel

`cloudflared` runs on the host. `bros` starts `scripts/bros-tunnel-helper.sh`, which owns the child process and files under `$BROS_HOME/data/tunnel`. `public_url` in bootstrap YAML is the enable + hostname signal (named tunnel + `route dns`). The container never spawns `cloudflared`. `pnpm dev` over the tunnel serves Vite CSS-as-JS imports from `/_nuxt/bros-mod/…*.js` so Cloudflare cannot reuse a `text/css` cache entry for the Nuxt client.
