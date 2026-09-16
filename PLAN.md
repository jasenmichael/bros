# PLAN — Bros

## Status

Implementation through M6 complete. Product brand is Bros (sidecars stay sidecars). See [PROGRESS.md](./PROGRESS.md).

## Milestones

1. **M0** — pnpm monorepo, theme + docs layers, app shell on :3055
2. **M1** — bootstrap config, SQLite, passcode
3. **M2** — sidecar engine + path proxy + Sidecars page
4. **M3** — core sidecars: ollama, opencode, openwebui, cloudflared
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
- `./bros stop` and interactive Ctrl+C: stop all `bros-sc-*` sidecars, then core compose down (no orphan sidecar stacks)
