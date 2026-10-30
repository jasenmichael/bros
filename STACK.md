# STACK — Bros

| Layer | Choice |
|-------|--------|
| Language | TypeScript |
| Package manager | **pnpm workspaces** |
| App | Nuxt 4 `@bros/ui` in `src/ui` |
| Server | Nitro in `src/server` (`serverDir`) |
| Docs content | Repo-root `docs/` (Nuxt Content, on the docs layer) |
| Docs layer | `@bros/docs` in `src/layers/docs` (`/docs` pages; extends theme) |
| Theme layer | `@bros/theme` in `src/layers/theme` (UI, CSS, layouts, nav chrome, markdown/prose) |
| Docs/marketing site | `@bros/website` in `src/website` (Pages `/bros/`; owns `/`) |
| UI override | App extends theme + docs; **`/` = dashboard**; `/docs` unchanged |
| Tests | Vitest + `@nuxt/test-utils` |
| DB | SQLite + Drizzle (`bros.sqlite`). Saved host-Ollama probe port is `app_settings.host_probe_port`. |
| Docker | dockerode + Compose CLI in image |
| Host port | `BROS_PORT` default **3055** on the UI host, `BROS_HOST` default **0.0.0.0**. Docs site `pnpm --dir src docs:dev` is **3056**. |
| Docker app host ports | Ollama **11435** (container 11434), OpenCode **4097**, Open WebUI **3080** (container 8080), Firecrawl **3002**, Firecrawl UI **3081** (container 8080), OpenJEV **8092** (container 8080), Pi (CLI, no host port), Desktop stream **3300**→3000 and ttyd **7681** (both `127.0.0.1` only), Whisper **8090** (container 8000). Never publish 3000 or 8080 on `0.0.0.0`. |
| Path proxy | Nitro allowlist middleware + h3 `proxyRequest` (HTTP/SSE) and httpxy `proxyUpgrade` (WebSocket). `proxy.public` webuis that natively listen under `/${id}/` (none shipped today). `/terminal/session` to `BROS_TERMINAL_ORIGIN`. `/desktop/view/` to `BROS_DESKTOP_STREAM_ORIGIN` (websocket upgrade, session cookie). |
| Env prefix | `BROS_*` |
| Host tunnel | `cloudflared` on the host. `public_url` in bootstrap YAML starts a named tunnel via `cloudflared tunnel route dns` + `run --protocol http2`; otherwise a quick tunnel. `bros` runs a helper that writes `$BROS_HOME/data/var/tunnel`. |
| Network / data | `bros` / host `$BROS_HOME/data` binds (`$BROS_HOST_DATA_DIR`), including `$BROS_HOME/data/home` (Desktop `$HOME`) and `$BROS_HOME/data/home/.cache/huggingface/hub` (Whisper HF cache). Every container runs as `BROS_HOST_UID`:`BROS_HOST_GID` (default `id -u` / `id -g`), except `bros`, which starts as root so Selkies can start and sets `PUID`/`PGID` to that host uid, and Firecrawl Postgres and RabbitMQ, which run as root. Docker apps (core Ollama/Whisper, addons, custom) live under `lib/apps/core/<id>`, `lib/apps/addon/<id>`, and `data/config/apps/<id>` as `kind: docker`. A custom app is not in the repo. Moving that directory into `lib/apps/addon` or `lib/apps/core` ships it. The Bros image is `lib/desktop`. Compose-app calls use Docker DNS on network `bros`. |
| Internal specialist | Git submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)); packaged GGUF + Modelfile installed into the Ollama docker app (`ollama create bros`), not a host daemon |

## Layout

```text
bros/
  bros                  # CLI symlink to cli/target/release/bros
  cli/                  # Rust CLI
  docs/
  src/ui/              # Vue pages, components, composables, utils
  src/website/
  src/layers/{theme,docs}/
  src/server/
    api/                # HTTP routes, one folder per surface
    utils/
      cli/managers/     # one file per package manager (parse, label, suggest)
      providers/        # provider module (index.ts is the interface)
      settings/         # host Ollama + Whisper toggles
      chat/
      docker-app/
  lib/desktop/managers/  # same kinds: install, remove, present
  src/                  # pnpm workspace root (package.json, lock, layers)
  vendor/bros-model/    # submodule: internal specialist
```

A utils concept gets a folder when it already has three or more files. One file stays flat. Route handlers stay thin and call those modules. `#bros` points at `src/server/utils`.

The Bros image runs Node 26.7.0. Desktop does not copy that binary onto `PATH`. The Desktop build mounts it to run `install.ts` for `kind: run`.

## Layer chain

```text
theme  →  docs  →  app     (`/` = dashboard, extra pages)
                →  website (`/` = marketing homepage)
```

Docs extends theme. App and website also extend theme + docs so both layers stay explicit. Theme owns layouts and markdown visualization.

## Compose

- `docker-compose.yml` plus one overlay: `docker-compose.prod.yml` or `docker-compose.dev.yml` (`BROS_DEV=1`). Host start and `bros update` regenerate `$BROS_HOST_DATA_DIR/config/apps-compose.yml` from enabled packs, then merge it (same third file Desktop recreate uses) for package webui ports/volumes under service `bros`. Core + docker apps join external network `bros` (`external: true`). `bros` / dockerode create it if missing so compose never tries to own/relabel it. Listen env on the base file is `BROS_PORT` and `BROS_HOST`. The process binds `BROS_HOST` (default `0.0.0.0`).
- Dev start (`BROS_DEV=1 ./bros` or `./bros --dev`): requires host `pnpm` and `cargo`. Desktop is `compose up -d --no-deps bros` without `--build` (builds only if `bros:dev` is missing). The UI is `pnpm --dir src --filter @bros/ui dev` on the host. `bros-ui` does not start. Rebuild: `BROS_DEV=1 ./bros update`.
- Prod start (`bros`): requires Docker. Desktop is `compose up --build -d --no-deps bros`. If `pnpm` is on `PATH`, the UI is host `node` on the built Nitro server `src/ui/.output/server/index.mjs` (build first when that file is missing). Otherwise `docker compose --profile ui up -d --build bros-ui`.
- Dev image (`Dockerfile` target `development`): desktop toolchain only. Prod image (`production`) is the desktop. Target `ui` is the Node 26.7.0 runner for `bros-ui`, from the `nodetools` stage (pnpm 12.15.0). `@bros/website` is GitHub Pages only (`.dockerignore` skips `src/website`). The desktop bind-mounts `$BROS_HOST_REPO` at the same path. The image build runs `pnpm --filter @bros/ui build`. The image installs `git`. pnpm 12 reads hoist from `src/pnpm-workspace.yaml` (`shamefullyHoist: true`, `minimumReleaseAge: 0`, `verifyDepsBeforeRun: false`); `.npmrc` is auth and registry only. `src/server` sits outside `@bros/ui`, so that hoist is what lets the TypeScript entry resolve `pathe` and the other server imports.
- Docker apps **not** in main Compose; managed via Docker socket
- Persistent data is host binds under `$BROS_HOME/data` (repo `./data`, installed `~/.bros/data`), not named `bros-data` / `bros-ollama-data` volumes. Start does not copy leftover named volumes. Dev `node_modules` volumes stay named caches.
- Docs site: `pnpm --dir src docs:dev` → http://127.0.0.1:3056/bros/ ; `pnpm --dir src docs:generate` then `pnpm --dir src --filter @bros/website preview`. Pages artifact is `src/website/.output/public`.
- Host UI (`pnpm` on the host): Chat/Providers/STT reach docker app Ollama at `127.0.0.1:11435` (`BROS_OLLAMA_PORT`) and Whisper at `127.0.0.1:8090` (`BROS_WHISPER_PORT`); host Ollama at `127.0.0.1:<probe>` via `dockerHostCandidates()` (`src/server/utils/hostProbe.ts`). Container `bros-ui` uses Docker DNS (`http://ollama:11434`, `http://whisper:8000`) and `host.docker.internal` for host Ollama only. Stream and terminal origins are `BROS_DESKTOP_STREAM_ORIGIN` and `BROS_TERMINAL_ORIGIN`. Docker app `docker compose` injects `BROS_HOST_DATA_DIR` so binds are `$BROS_HOME/data/...`, not host `/ollama`.
- Dev CSS through the tunnel: Vite serves one `.css` path as `text/css` (`<link>`) or `text/javascript` (JS import). Cloudflare caches that path (query string ignored), so a stylesheet body is reused for the module import and Nuxt never hydrates (Unlock does nothing). Dev rewrites CSS module imports to `/_nuxt/bros-mod/…*.js` and sends `CDN-Cache-Control: no-store` on Vite `/_nuxt` assets. Production hashed CSS is not affected.
- Ollama recovery toast is Nuxt UI `useToast`.
