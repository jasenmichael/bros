# PLAN — Bros

## Status

Implementation through M6 complete. Product brand is Bros (sidecars stay sidecars). See [PROGRESS.md](./PROGRESS.md).

## Milestones

1. **M0** — pnpm monorepo, theme + docs layers, app shell on :3055
2. **M1** — bootstrap config, SQLite, passcode
3. **M2** — sidecar engine + path proxy + Sidecars page
4. **M3** — core sidecars: ollama, opencode, openwebui (tunnel later moved to host cloudflared)
5. **M4** — Models page
6. **M5** — Chat streaming + history
7. **M6** — docs content, compose prod/dev, root docs

## Layer chain

`theme` → `docs` → `app` (dashboard overrides `/`); `website` for Pages.

## Follow-ups (manual)

- No auto-migrate of pre-rename Docker volumes
- Named `bros-data` / `bros-ollama-data` / sidecar volumes: `./bros` one-shot copies into `$BROS_DIR/data` when dest empty; old volumes left in place
- Docs site: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ ; generate + `pnpm --filter @bros/website preview`

## Data dir binds

Persistent sidecar + app state is `$BROS_DIR/data` on the host (`./data` in a checkout, `~/.bros/data` when installed).

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
