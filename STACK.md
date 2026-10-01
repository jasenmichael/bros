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
| Host port | 3055 (app), 3056 (docs site `pnpm --dir src docs:dev`) |
| Sidecar host ports | Ollama **11435** (container 11434), OpenCode **4097**, Open WebUI **3080** (container 8080), Firecrawl **3002**, Firecrawl UI **3081** (container 8080), OpenJEV **8092** (container 8080), Whisper **8090** (container 8000). Never 3000 or 8080. |
| Path proxy | Nitro allowlist middleware + h3 `proxyRequest` (HTTP/SSE) and httpxy `proxyUpgrade` (WebSocket). Only `sidecar.yml` `proxy.public` webuis that natively listen under `/${id}/`. No shipped pack opts in today. |
| Env prefix | `BROS_*` |
| Host tunnel | `cloudflared` on the host. `public_url` in bootstrap YAML starts a named tunnel via `cloudflared tunnel route dns` + `run --protocol http2`; otherwise a quick tunnel. `bros` runs a helper that writes `$BROS_HOME/data/tunnel`. |
| Network / data | `bros` / host `$BROS_HOME/data` binds (`$BROS_HOST_DATA_DIR`), including `$BROS_HOME/data/whisper/home/ubuntu/.cache/huggingface/hub` (Speaches HF cache; compose `user: "0:0"` so a Docker-created root bind is writable). Packages live in `lib/sidecars/core`, `lib/sidecars/addon`, and gitignored `$BROS_SIDECARS_DIR` (default `$BROS_DIR/sidecars`). Production mounts those as `/app/sidecars/{core,addon,custom}`. Dev does not mount `/app/sidecars/{core,addon,custom}` (those mounts are production-only); discovery uses `/app/lib/sidecars` and `/app/sidecars`. Compose-app sidecar APIs use Docker DNS on that network. |
| Internal specialist | Git submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)); packaged GGUF + Modelfile installed into the Ollama sidecar (`ollama create bros`), not a host daemon |

## Layout

```text
bros/
  bros                  # CLI
  docs/
  src/app/              # Vue pages, components, composables, utils
  src/website/
  src/layers/{theme,docs}/
  src/server/
    api/                # HTTP routes, one folder per surface
    utils/
      providers/        # provider module (index.ts is the interface)
      settings/         # host Ollama + Whisper toggles
      chat/
      sidecars/
  src/                  # pnpm workspace root (package.json, lock, layers)
  vendor/bros-model/    # submodule: internal specialist
```

A utils concept gets a folder when it already has three or more files. One file stays flat. Route handlers stay thin and call those modules. `#bros` points at `src/server/utils`.

## Layer chain

```text
theme  →  docs  →  app     (`/` = dashboard, extra pages)
                →  website (`/` = marketing homepage)
```

Docs extends theme. App and website also extend theme + docs so both layers stay explicit. Theme owns layouts and markdown visualization.

## Compose

- `docker-compose.yml` + `docker-compose.dev.yml` / `docker-compose.prod.yml`. Core + sidecars join external network `bros` (`external: true`). `bros` / dockerode create it if missing so compose never tries to own/relabel it.
- Dev start (`BROS_DEV=1 ./bros`): `compose up` without `--build`. Builds only if `bros:dev` is missing. Daily source edits use the bind-mount. Rebuild/pull: `BROS_DEV=1 ./bros update`.
- Prod start (`bros`): `compose up --build` (source is baked into `bros:latest`).
- Dev image (`Dockerfile` target `development`): toolchain only — no source `COPY`; bind-mount `./:/app`, then `pnpm install` in `/app/src` + `pnpm --filter @bros/app dev`
- Sidecars **not** in main Compose; managed via Docker socket
- Persistent data is host binds under `$BROS_HOME/data` (repo `./data`, installed `~/.bros/data`), not named `bros-data` / `bros-ollama-data` volumes. Start does not copy leftover named volumes. Dev `node_modules` volumes stay named caches.
- Docs site: `pnpm --dir src docs:dev` → http://127.0.0.1:3056/bros/ ; `pnpm --dir src docs:generate` then `pnpm --dir src --filter @bros/website preview`. Pages artifact is `src/website/.output/public`.
- Host Node (`pnpm --dir src app:dev`): Chat/Providers/STT reach sidecar Ollama at `127.0.0.1:11435` (`BROS_OLLAMA_PORT`) and Whisper at `127.0.0.1:8090` (`BROS_WHISPER_PORT`); host Ollama at `127.0.0.1:<probe>`. Compose app uses Docker DNS (`http://ollama:11434`, `http://whisper:8000`) and `host.docker.internal` for host Ollama only. Sidecar `docker compose` injects `BROS_HOST_DATA_DIR` so binds are `$BROS_HOME/data/...`, not host `/ollama`.
