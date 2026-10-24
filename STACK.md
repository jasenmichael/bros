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
| DB | SQLite + Drizzle (`bros.sqlite`). Saved host-Ollama probe port is `sidecar_settings.host_probe_port`. |
| Docker | dockerode + Compose CLI in image |
| Host port | `BROS_PORT` default **3055**, `BROS_HOST` default **0.0.0.0** (app, local network). Docs site `pnpm --dir src docs:dev` is **3056**. |
| Sidecar host ports | Ollama **11435** (container 11434), OpenCode **4097**, Open WebUI **3080** (container 8080), Firecrawl **3002**, Firecrawl UI **3081** (container 8080), OpenJEV **8092** (container 8080), Pi (CLI, no host port), Desktop (Selkies 3000 and ttyd 7681, both unpublished), Whisper **8090** (container 8000). Never publish 3000 or 8080. |
| Path proxy | Nitro allowlist middleware + h3 `proxyRequest` (HTTP/SSE) and httpxy `proxyUpgrade` (WebSocket). `proxy.public` webuis that natively listen under `/${id}/` (none shipped today). `/terminal/session` to `http://desktop:7681`. `/desktop/view/` to `http://desktop:3000` (websocket upgrade, session cookie). |
| Env prefix | `BROS_*` |
| Host tunnel | `cloudflared` on the host. `public_url` in bootstrap YAML starts a named tunnel via `cloudflared tunnel route dns` + `run --protocol http2`; otherwise a quick tunnel. `bros` runs a helper that writes `$BROS_HOME/data/var/tunnel`. |
| Network / data | `bros` / host `$BROS_HOME/data` binds (`$BROS_HOST_DATA_DIR`), including `$BROS_HOME/data/home` (Desktop `$HOME`) and `$BROS_HOME/data/home/.cache/huggingface/hub` (Whisper HF cache). Every container runs as `BROS_HOST_UID`:`BROS_HOST_GID` (default `id -u` / `id -g`), except `bros-desktop`, which starts as root so Selkies can start and sets `PUID`/`PGID` to that host uid, and Firecrawl Postgres and RabbitMQ, which run as root. Packages live in `lib/sidecars/core`, `lib/sidecars/addon`, and `lib/sidecars/custom` (only `README.md` tracked). A custom pack can later move to addon or core. An addon can later move to core. Production mounts core and addon read-only and custom writable at `/app/sidecars/{core,addon,custom}`. Dev does not mount `/app/sidecars/{core,addon,custom}`; discovery uses `/app/lib/sidecars`. Compose-app sidecar APIs use Docker DNS on that network. |
| Internal specialist | Git submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)); packaged GGUF + Modelfile installed into the Ollama sidecar (`ollama create bros`), not a host daemon |

## Layout

```text
bros/
  bros                  # Docker launcher (dev or prod, then the container)
  src/cli/              # @bros/cli
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
      sidecars/
  lib/sidecars/core/desktop/managers/  # same kinds: install, remove, present
  src/                  # pnpm workspace root (package.json, lock, layers)
  vendor/bros-model/    # submodule: internal specialist
```

A utils concept gets a folder when it already has three or more files. One file stays flat. Route handlers stay thin and call those modules. `#bros` points at `src/server/utils`.

The Bros image runs Node 26.7.0. The Desktop image copies its Node binary from `node:26.7.0-bookworm-slim`.

## Layer chain

```text
theme  →  docs  →  app     (`/` = dashboard, extra pages)
                →  website (`/` = marketing homepage)
```

Docs extends theme. App and website also extend theme + docs so both layers stay explicit. Theme owns layouts and markdown visualization.

## Compose

- `docker-compose.yml` plus one overlay: `docker-compose.prod.yml` or `docker-compose.dev.yml` (`BROS_DEV=1`). Core + sidecars join external network `bros` (`external: true`). `bros` / dockerode create it if missing so compose never tries to own/relabel it. Listen env on the base file is `BROS_PORT` and `BROS_HOST`. The process binds `BROS_HOST` (default `0.0.0.0`).
- Dev start (`BROS_DEV=1 ./bros` or `./bros --dev`): `compose up` without `--build`. Builds only if `bros:dev` is missing. Daily source edits use the bind-mount. Rebuild/pull: `BROS_DEV=1 ./bros update`.
- Prod start (`bros`): `compose up --build` (source is baked into `bros:latest`).
- Dev image (`Dockerfile` target `development`): toolchain only — no source `COPY`; bind-mount `./:/app`, then `pnpm install` in `/app/src` + `pnpm --filter @bros/ui dev`. The app service also bind-mounts `$BROS_HOST_REPO` at the same path. Prod bakes `@bros/cli` to `/usr/local/lib/bros-cli.mjs` and installs `git`. pnpm 12 sets `minimumReleaseAge: 0` and `verifyDepsBeforeRun: false` in `src/pnpm-workspace.yaml`.
- Sidecars **not** in main Compose; managed via Docker socket
- Persistent data is host binds under `$BROS_HOME/data` (repo `./data`, installed `~/.bros/data`), not named `bros-data` / `bros-ollama-data` volumes. Start does not copy leftover named volumes. Dev `node_modules` volumes stay named caches.
- Docs site: `pnpm --dir src docs:dev` → http://127.0.0.1:3056/bros/ ; `pnpm --dir src docs:generate` then `pnpm --dir src --filter @bros/website preview`. Pages artifact is `src/website/.output/public`.
- Host Node (`pnpm --dir src ui:dev`): Chat/Providers/STT reach sidecar Ollama at `127.0.0.1:11435` (`BROS_OLLAMA_PORT`) and Whisper at `127.0.0.1:8090` (`BROS_WHISPER_PORT`); host Ollama at `127.0.0.1:<probe>` via `dockerHostCandidates()` (`src/server/utils/hostProbe.ts`). Compose app uses Docker DNS (`http://ollama:11434`, `http://whisper:8000`) and `host.docker.internal` for host Ollama only. Sidecar `docker compose` injects `BROS_HOST_DATA_DIR` so binds are `$BROS_HOME/data/...`, not host `/ollama`.
- Dev CSS through the tunnel: Vite serves one `.css` path as `text/css` (`<link>`) or `text/javascript` (JS import). Cloudflare caches that path (query string ignored), so a stylesheet body is reused for the module import and Nuxt never hydrates (Unlock does nothing). Dev rewrites CSS module imports to `/_nuxt/bros-mod/…*.js` and sends `CDN-Cache-Control: no-store` on Vite `/_nuxt` assets. Production hashed CSS is not affected.
- Ollama recovery toast is Nuxt UI `useToast`.
