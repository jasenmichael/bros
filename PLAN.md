# PLAN — Bros

## Status

Implementation through M6 complete. Host tunnel, passkey session auth, and no-path-proxy sidecars are on `main`. No M7 — leftover work is unplanned follow-ups, not a numbered milestone. See [PROGRESS.md](./PROGRESS.md).

## Milestones

1. **M0** — pnpm monorepo, theme + docs layers, app shell on :3055
2. **M1** — bootstrap config, SQLite, passcode
3. **M2** — sidecar engine + Sidecars page (`publish` Open/Pin; no path proxy)
4. **M3** — core sidecars: ollama, opencode, openwebui (tunnel is host `cloudflared`, not a sidecar)
5. **M4** — Models page
6. **M5** — Chat streaming + history
7. **M6** — docs content, compose prod/dev, root docs

## Layer chain

`theme` → `docs` → `app` (dashboard overrides `/`); `website` for Pages.

## Follow-ups (unplanned)

Not a milestone. Pick when needed:

- CI: add test + typecheck jobs (Pages workflow only today)
- Tests: chat stream coverage; e2e beyond `/api/health`
- Chat: stop hardcoding cloud model ids (`gpt-4o`, `claude-3-5-sonnet-latest`); pick from provider config
- Custom sidecars: drop-in `$dataDir/sidecars` works; no add/upload UI
- Settings: paths + passkey only
- No auto-migrate of pre-rename Docker volumes
- Named `bros-data` / `bros-ollama-data` / sidecar volumes: `./bros` one-shot copies into `$BROS_DIR/data` when dest empty; old volumes left in place
- Docs site: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ ; generate + `pnpm --filter @bros/website preview`

## Data dir binds

Persistent sidecar + app state is `$BROS_DIR/data` on the host (`./data` in a checkout, `~/.bros/data` when installed).

## Recent (Chat nav)

- Chat page is conversation-only. Recents live in the dock under Status (open/collapsible; Rename + Delete). Bottom block: pinned sidecar UIs, then Docs + Settings, then GitHub. `/chat` = new; `/chat/:id` = saved. First successful reply titles from the same model.

## Recent (two Ollamas)

- Sidecar YAML: `containerPort` + `publish` (Ollama host **11435**, OpenCode **4097**, Open WebUI **3080**)
- Host Ollama is a Chat source (scan 11434/11436/22000 + `GET /api/version`, skip `bros-sc-ollama`)
- Start fails only if the Bros **publish** port is taken; host :11434 does not skip `bros-sc-ollama`

## Recent (Models)

- Pull streams NDJSON progress into Models UI (`UProgress`)
- Provider `upsertProvider` merges partial `config` (keeps `useGpu` when mode-only POSTs)
- Ollama start with `useGpu` force-recreates via `docker-compose.gpu.yml`

## Lifecycle (`./bros`)

- `./bros start` / `./bros --dev`: remove legacy `forgebox-sc-*` containers before up; app autostart uses project `bros-sc-<id>` only
- `./bros --dev` start: `compose up` (no `--build`; first run still builds if `bros:dev` is missing). Rebuild: `./bros update --dev`. Prod start stays `compose up --build`.
- `./bros stop` and interactive Ctrl+C: stop all `bros-sc-*` sidecars, then core compose down (no orphan sidecar stacks)

## Host tunnel

`cloudflared` runs on the host. `./bros` starts `scripts/bros-tunnel-helper.sh`, which owns the child process and files under `$BROS_DIR/data/tunnel`. `public_url` in `bros.yml` is the enable + hostname signal (named tunnel + `route dns`). The container never spawns `cloudflared`. `--dev` over the tunnel serves Vite CSS-as-JS imports from `/_nuxt/bros-mod/…*.js` so Cloudflare cannot reuse a `text/css` cache entry for the Nuxt client.
