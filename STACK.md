# STACK — Bros

| Layer | Choice |
|-------|--------|
| Language | TypeScript |
| Package manager | **pnpm workspaces** |
| App | Nuxt 4 `@bros/app` in `src/app` |
| Server | Nitro in `src/server` (`serverDir`) |
| Docs content | Repo-root `docs/` (Nuxt Content) |
| Docs layer | `@bros/docs` in `src/layers/docs` |
| Theme layer | `@bros/theme` in `src/layers/theme` |
| Docs/marketing site | `@bros/website` in `src/website` (Pages `/bros/`) |
| UI override | App extends docs layer; **`/` = dashboard** |
| Tests | Vitest + `@nuxt/test-utils` |
| DB | SQLite + Drizzle (`bros.sqlite`) |
| Docker | dockerode + Compose CLI in image |
| Proxy | httpxy |
| Host port | 3055 (app), 3056 (docs site `pnpm docs:dev`) |
| Env prefix | `BROS_*` |
| Network / data | `bros` / host `$BROS_DIR/data` binds (`$BROS_HOST_DATA_DIR`) |

## Layout

```text
bros/
  docs/
  src/app/
  src/website/
  src/layers/{theme,docs}/
  src/server/
```

## Layer chain

```text
theme → docs layer → app (overrides index)
                  ↘ website (generate → GitHub Pages)
```

## Compose

- `docker-compose.yml` + `docker-compose.dev.yml` / `docker-compose.prod.yml`
- Dev image (`Dockerfile` target `development`): toolchain only — no source `COPY`; bind-mount `./:/app`, then `pnpm install` + `pnpm --filter @bros/app dev`
- Sidecars **not** in main Compose; managed via Docker socket
- Persistent data is host binds under `$BROS_DIR/data` (repo `./data`, installed `~/.bros/data`), not named `bros-data` / `bros-ollama-data` volumes. Dev `node_modules` volumes stay named caches.
- Docs site: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ ; `pnpm docs:generate` then `pnpm --filter @bros/website preview`. Pages artifact is `src/website/.output/public`.
