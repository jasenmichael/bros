# STACK — Bros

| Layer | Choice |
|-------|--------|
| Language | TypeScript |
| Package manager | **pnpm workspaces** |
| App | Nuxt 4 `@bros/app` in `src/app` |
| Server | Nitro in `src/server` (`serverDir`) |
| Docs content | Repo-root `docs/` (Nuxt Content, on the docs layer) |
| Docs layer | `@bros/docs` in `src/layers/docs` (`/docs` pages; extends theme) |
| Theme layer | `@bros/theme` in `src/layers/theme` (UI, CSS, layouts, nav chrome, markdown/prose) |
| Docs/marketing site | `@bros/website` in `src/website` (Pages `/bros/`; owns `/`) |
| UI override | App extends theme + docs; **`/` = dashboard**; `/docs` unchanged |
| Tests | Vitest + `@nuxt/test-utils` |
| DB | SQLite + Drizzle (`bros.sqlite`) |
| Docker | dockerode + Compose CLI in image |
| Host port | 3055 (app), 3056 (docs site `pnpm docs:dev`) |
| Sidecar host ports | Ollama **11435** (container 11434), OpenCode **4097**, Open WebUI **3080** (container 8080). Never 3000 or 8080. |
| Env prefix | `BROS_*` |
| Host tunnel | `cloudflared` on the host. `public_url` in bootstrap YAML starts a named tunnel via `cloudflared tunnel route dns` + `run --protocol http2`; otherwise a quick tunnel. `bros` runs a helper that writes `$BROS_HOME/data/tunnel`. |
| Network / data | `bros` / host `$BROS_HOME/data` binds (`$BROS_HOST_DATA_DIR`) |
| Internal specialist | Git submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)); packaged GGUF + Modelfile installed into the Ollama sidecar (`ollama create bros`), not a host daemon |

## Layout

```text
bros/
  docs/
  src/app/
  src/website/
  src/layers/{theme,docs}/
  src/server/
  vendor/bros-model/   # submodule: internal specialist
```

## Layer chain

```text
theme  →  docs  →  app     (`/` = dashboard, extra pages)
                →  website (`/` = marketing homepage)
```

Docs extends theme. App and website also extend theme + docs so both layers stay explicit. Theme owns layouts and markdown visualization.

## Compose

- `docker-compose.yml` + `docker-compose.dev.yml` / `docker-compose.prod.yml`
- Dev start (`pnpm dev` / `BROS_DEV=1 ./bros`): `compose up` without `--build`. Builds only if `bros:dev` is missing. Daily source edits use the bind-mount. Rebuild/pull: `pnpm dev:update`.
- Prod start (`bros`): `compose up --build` (source is baked into `bros:latest`).
- Dev image (`Dockerfile` target `development`): toolchain only — no source `COPY`; bind-mount `./:/app`, then `pnpm install` + `pnpm --filter @bros/app dev`
- Sidecars **not** in main Compose; managed via Docker socket
- Persistent data is host binds under `$BROS_HOME/data` (repo `./data`, installed `~/.bros/data`), not named `bros-data` / `bros-ollama-data` volumes. Dev `node_modules` volumes stay named caches.
- Docs site: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ ; `pnpm docs:generate` then `pnpm --filter @bros/website preview`. Pages artifact is `src/website/.output/public`.
- Host Node (`pnpm app:dev`): Chat/Models reach sidecar Ollama at `127.0.0.1:11435` and host Ollama at `127.0.0.1:<probe>`. Compose app keeps Docker DNS (`http://ollama:11434`, `host.docker.internal`). Sidecar `docker compose` injects `BROS_HOST_DATA_DIR` so binds are `$BROS_HOME/data/...`, not host `/ollama`.
