# STACK — Bros

| Layer | Choice |
|-------|--------|
| Language | TypeScript |
| Package manager | **pnpm workspaces** |
| App | Nuxt 4 `@bros/ui` in `app/ui` |
| Server | Nitro in `app/server` (`serverDir`) |
| Docs content | Repo-root `docs/` (Nuxt Content, on the docs layer) |
| Docs layer | `@bros/docs` in `app/layers/docs` (`/docs` pages; extends theme) |
| Theme layer | `@bros/theme` in `app/layers/theme` (UI, CSS, layouts, nav chrome, markdown/prose) |
| Docs/marketing site | `@bros/website` in `app/website` (Pages `/bros/`; owns `/`) |
| UI override | App extends theme + docs; **`/` = dashboard**; `/docs` unchanged |
| Tests | Vitest + `@nuxt/test-utils` |
| DB | SQLite + Drizzle (`bros.sqlite`). Saved host-Ollama probe port is `app_settings.host_probe_port`. |
| Docker | dockerode + Compose CLI in image |
| Host port | `BROS_PORT` default **3055** on the UI host, `BROS_HOST` default **0.0.0.0**. Docs site `pnpm --dir app docs:dev` is **3056**. |
| Docker app host ports | Ollama **11435** (container 11434), OpenCode **4096**, Open WebUI **3080** (container 8080), Firecrawl **3002**, Firecrawl UI **3081** (container 8080), OpenJEV **8092** (container 8080), Pi (CLI, no host port), Desktop stream **3300**→3000 and ttyd **7681** (both `127.0.0.1` only), Whisper **8090** (container 8000). Never publish 3000 or 8080 on `0.0.0.0`. |
| Path proxy | Nitro allowlist middleware + h3 `proxyRequest` (HTTP/SSE) and httpxy `proxyUpgrade` (WebSocket). `proxy.public` webuis that natively listen under `/${id}/` (none shipped today). `/terminal/session` to `BROS_TERMINAL_ORIGIN`. `/desktop/view/` to `BROS_DESKTOP_STREAM_ORIGIN` (websocket upgrade, session cookie). |
| Env prefix | `BROS_*` |
| Host tunnel | `cloudflared` on the host. `public_url` in bootstrap YAML starts a named tunnel via `cloudflared tunnel route dns` + `run --protocol http2`; otherwise a quick tunnel. `bros` runs a helper that writes `$BROS_DIR/data/var/tunnel`. |
| Network / data | `bros` / host `$BROS_DIR/data` binds (`$BROS_DATA_DIR`), including `$BROS_DIR/data/home` (Desktop `$HOME`) and `$BROS_DIR/data/home/.cache/huggingface/hub` (Whisper HF cache). Every container runs as `BROS_HOST_UID`:`BROS_HOST_GID` (default `id -u` / `id -g`), except `bros`, which starts as root so Selkies can start and sets `PUID`/`PGID` to that host uid, and Firecrawl Postgres and RabbitMQ, which run as root. Docker apps (core Ollama/Whisper, addons, custom) live under `lib/apps/core/<id>`, `lib/apps/addon/<id>`, and `data/config/apps/<id>` as `kind: docker`. A custom app is not in the repo. Moving that directory into `lib/apps/addon` or `lib/apps/core` ships it. The Bros image is `lib/desktop`. Compose-app calls use Docker DNS on network `bros`. |
| Internal specialist | Git submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)) on a source checkout; packaged GGUF + Modelfile installed into the Ollama docker app (`ollama create bros`), not a host daemon. Release tarballs omit `vendor/`. `lib/apps/core/ollama/BROS_MODEL_VERSION` is `1.0.0`. Install and `bros update` download that GitHub release when the local stamp is missing or older. |

## Layout

```text
bros/
  bros                  # checkout symlink → cli/target/release/bros (scripts/build.sh; not BROS_BIN)
  scripts/build.sh      # local CLI + UI build + ./bros symlink (no release)
  cli/                  # Rust CLI
  docs/
  app/ui/              # Vue pages, components, composables, utils
  app/website/
  app/layers/{theme,docs}/
  app/server/
    api/                # HTTP routes, one folder per surface
    utils/
      cli/managers/     # one file per package manager (parse, label, suggest)
      providers/        # provider module (index.ts is the interface)
      settings/         # host Ollama + Whisper toggles
      chat/
      docker-app/
  lib/desktop/managers/  # same kinds: install, remove, present
  app/                  # pnpm workspace root (package.json, lock, layers)
  vendor/bros-model/    # submodule: internal specialist
```

A utils concept gets a folder when it already has three or more files. One file stays flat. Route handlers stay thin and call those modules. `#bros` points at `app/server/utils`.

The Bros image runs Node 26.7.0. Desktop does not copy that binary onto `PATH`. The Desktop build mounts it to run `install.ts` for `kind: run`.

## Layer chain

```text
theme  →  docs  →  app     (`/` = dashboard, extra pages)
                →  website (`/` = marketing homepage)
```

Docs extends theme. App and website also extend theme + docs so both layers stay explicit. Theme owns layouts and markdown visualization.

## Compose

- `lib/desktop/docker-compose.yml` plus one overlay: `lib/desktop/docker-compose.prod.yml` or `lib/desktop/docker-compose.dev.yml` (`BROS_DEV=1`). Host start and `bros update` pass `--project-directory` as the repo and regenerate `$BROS_DATA_DIR/config/apps-compose.yml` from enabled packs, then merge it (Desktop recreate uses the same `--project-directory` and third file) for package webui ports/volumes under service `bros`. Core + docker apps join external network `bros` (`external: true`). `bros` / dockerode create it if missing so compose never tries to own/relabel it. Listen env on the base file is `BROS_PORT` and `BROS_HOST`. The process binds `BROS_HOST` (default `0.0.0.0`).
- Dev start (`BROS_DEV=1 ./bros` or `./bros --dev`): requires host `pnpm` and `cargo`. Desktop is `compose up -d --no-deps bros` without `--build` (builds only if `bros:dev` is missing). The UI is `pnpm --dir app --filter @bros/ui dev` on the host. `bros-ui` does not start. `--use-runner` or `BROS_USE_RUNNER=1` with dev exits `dev does not use the UI runner`. Rebuild: `BROS_DEV=1 ./bros update`.
- Prod start (`bros`): requires Docker. Desktop is `compose up --build -d --no-deps bros`. If `pnpm` is on `PATH` and `--use-runner` / `BROS_USE_RUNNER=1` is off, the UI is host `node` on the built Nitro server `app/ui/.output/server/index.mjs` (build first when that file is missing). Otherwise `docker compose --profile ui up -d --build bros-ui`. A release already uses `bros-ui`.
- Dev image (`Dockerfile` target `development`): desktop toolchain only. Prod image (`production`) is the desktop and copies `lib/` and `scripts/docker/` from the build context into `/app/lib` and `/app/scripts/docker`. Target `ui` is the Node 26.7.0 runner for `bros-ui`, from the `nodetools` stage (pnpm 12.15.0). It runs the prebuilt Nitro server `app/ui/.output` and does not `pnpm install` or rebuild `@bros/ui`. `@bros/website` is GitHub Pages only (`.dockerignore` skips `app/website`). The desktop bind-mounts `$BROS_HOST_REPO` at the same path. The image installs `git`. pnpm 12 reads hoist from `app/pnpm-workspace.yaml` (`shamefullyHoist: true`, `minimumReleaseAge: 0`, `verifyDepsBeforeRun: false`); `.npmrc` is auth and registry only. `app/server` sits outside `@bros/ui`, so that hoist is what lets the TypeScript entry resolve `pathe` and the other server imports.
- Docker apps **not** in main Compose; managed via Docker socket
- Persistent data is host binds under `$BROS_DIR/data` (repo `./data`, installed `~/.bros/data`), not named `bros-data` / `bros-ollama-data` volumes. Start does not copy leftover named volumes. Dev `node_modules` volumes stay named caches.
- Docs site: `pnpm --dir app docs:dev` → http://127.0.0.1:3056/bros/ ; `pnpm --dir app docs:generate` then `pnpm --dir app --filter @bros/website preview`. Pages artifact is `app/website/.output/public`.
- Host UI (`pnpm` on the host): Chat/Providers/STT reach docker app Ollama at `127.0.0.1:11435` (`BROS_OLLAMA_PORT`) and Whisper at `127.0.0.1:8090` (`BROS_WHISPER_PORT`); host Ollama at `127.0.0.1:<probe>` via `dockerHostCandidates()` (`app/server/utils/hostProbe.ts`). Container `bros-ui` uses Docker DNS (`http://ollama:11434`, `http://whisper:8000`) and `host.docker.internal` for host Ollama only. Stream and terminal origins are `BROS_DESKTOP_STREAM_ORIGIN` and `BROS_TERMINAL_ORIGIN`. Docker app `docker compose` injects `BROS_DATA_DIR` so binds are `$BROS_DIR/data/...`, not host `/ollama`.
- Dev CSS through the tunnel: Vite serves one `.css` path as `text/css` (`<link>`) or `text/javascript` (JS import). Cloudflare caches that path (query string ignored), so a stylesheet body is reused for the module import and Nuxt never hydrates (Unlock does nothing). Dev rewrites CSS module imports to `/_nuxt/bros-mod/…*.js` and sends `CDN-Cache-Control: no-store` on Vite `/_nuxt` assets. Production hashed CSS is not affected.
- Ollama recovery toast is Nuxt UI `useToast`.

## Release

Product version is `0.0.1` in `VERSION`, `cli/Cargo.toml`, `cli/Cargo.lock`, and the five `app` package manifests. `bros -v` reads `VERSION` first. The packaged model release is `lib/apps/core/ollama/BROS_MODEL_VERSION` (`1.0.0`).

Direct push to `main` is blocked. Workflows do not push a commit to `main`.

`.github/workflows/ci.yml` runs on a pull request targeting `main` only (not on push to `main`, not on release). Jobs `js` (pnpm typecheck + `pnpm test:ci` = Vitest unit + nuxt) and `rust` (`cargo test` in `cli/`) must pass. The repo ruleset on `main` should require status checks `CI / js` and `CI / rust` before merge (GitHub → Settings → Rules → main). Release does not re-run tests. E2e (`test/e2e`) needs a live app on `:3055` and is not part of CI.

`.github/workflows/bump.yml` runs on a pull request opened or updated against `main`. While tag `v0.0.1` is missing it leaves `VERSION` alone, so the next merge publishes `0.0.1`. After that tag exists, the workflow reads conventional commits on the branch. `feat` is minor, `fix` and `perf` are patch, `feat!` or a `BREAKING CHANGE` footer is major. `chore`, `docs`, `refactor`, `test`, and `ci` do not bump. When a type is found and the branch has no `chore: bump` commit yet, it runs `scripts/bump.sh` and pushes that one commit onto the pull request branch. A later commit does not add another bump unless it raises the type. The message is `chore: bump <type> to X.Y.Z`.

`.github/workflows/release.yml` runs when a pull request into `main` is merged. It reads `VERSION` from the merge commit. If tag `v<VERSION>` is missing it tags that commit and uploads the Linux and macOS tarballs. It does not change the number. A merge that leaves `VERSION` unchanged does not publish. The CLI matrix uses `Swatinem/rust-cache` keyed by target.

`scripts/bump.sh patch|minor|major` writes the same version files and commits on the current branch. It does not push.

bros-model `VERSION` is `1.0.0`. `pyproject.toml` stays the training package at `0.1.0`. Its next merge to `main` tags `v1.0.0` and uploads `bros-model.tar.gz`. That first tag does not open a Bros pull request, because Bros `0.0.1` already records `lib/apps/core/ollama/BROS_MODEL_VERSION` `1.0.0`. After both tags exist, the same commit scan bumps each repo. A later bros-model merge that changes `VERSION` opens one Bros pull request: new `lib/apps/core/ollama/BROS_MODEL_VERSION`, `vendor/bros-model` at that tag, and a Bros minor bump. Merging that pull request publishes Bros.
