---
title: Development
description: Build and run a checkout with scripts/build.sh, or hot-reload with BROS_DEV=1 ./bros.
---

# Development

Contributors need Docker, host `pnpm`, and `cargo`. The CLI is `cli/`. The pnpm workspace root is `app/`. Publishing a release is CI only (`scripts/pack-release.sh` + GitHub Actions). There is no local release command.

## Install from source on the development branch

This checkout is the install: branch `development` in `BROS_DIR` (default `~/.bros`). It can be the starting point. `bros update` on `development` fast-forwards that branch. The release tarball install is a different command and does not use `BROS_REF`:

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

`BROS_REF` defaults to `main`. There is no `--branch` flag. Set `BROS_REF` on the shell that runs the script. A pipe does not pass `curl`'s environment to `bash`. This curl runs `scripts/install.sh` from branch `development` and clones that same ref:

```bash
curl -fsSL https://raw.githubusercontent.com/jasenmichael/bros/development/scripts/install.sh | BROS_REF=development bash -s -- --from-src
```

From the install root:

```bash
cd "${BROS_DIR:-$HOME/.bros}"
pnpm --dir app install
pnpm --dir app --filter @bros/ui dev
cargo run --manifest-path cli/Cargo.toml
```

Full install notes: [Install](/docs/install.md).

## Clone and develop

A separate git clone, not the install root. This is how you change the app. `main` is the release branch. Check out `development` in the clone.

```bash
git clone https://github.com/jasenmichael/bros.git
cd bros
git checkout development
pnpm --dir app install
pnpm --dir app --filter @bros/ui dev
cargo run --manifest-path cli/Cargo.toml
```

## Build and run (production mode)

Run this in the install root or in that clone. It builds the host CLI and UI, then starts the stack with the prebuilt UI (not Vite). Does not build container images for other OS/arch. Does not create `~/.local/bin/bros` (install-only).

```bash
pnpm --dir app install
scripts/build.sh
./bros
# http://127.0.0.1:3055
```

`scripts/build.sh` runs `cargo build --release` for `cli/`, builds `@bros/ui` into `app/ui/.output`, and refreshes `bros` → `cli/target/release/bros`. Do not set `BROS_DEV=1` and do not pass `--dev`.

```bash
./bros -D          # leave UI host up after the command exits
./bros --use-runner  # or BROS_USE_RUNNER=1: UI in container bros-ui
./bros stop
```

When `app/ui/.output/server/index.mjs` exists, the UI host runs that file. `--use-runner` / `BROS_USE_RUNNER=1` starts `bros-ui` instead (that image copies `.output` and does not run `pnpm`). Desktop still uses `compose up --build`.

## Dev (hot-reload)

Bind-mount desktop + Vite UI on the host. Needs `pnpm` and `cargo` on `PATH`. Never starts `bros-ui`. `--use-runner` or `BROS_USE_RUNNER=1` with dev errors.

```bash
pnpm --dir app install
BROS_DEV=1 ./bros
# or: ./bros --dev
# http://127.0.0.1:3055
```

If `./bros` is missing, run `scripts/build.sh` once (or `cargo build --release --manifest-path cli/Cargo.toml` and `ln -sfn cli/target/release/bros ./bros`). Dev UI is `pnpm --dir app --filter @bros/ui dev`. Ctrl+C stops the full stack. `-D` is ignored in dev.

```bash
BROS_DEV=1 ./bros update   # after Dockerfile or compose changes
BROS_DEV=1 ./bros stop
```

## Host pnpm

Node **22+**, pnpm **12.15.0**. Dev uses that pnpm for the UI. Docs and tests use the same workspace. Docker is still required for the desktop and docker apps. Chat/Providers talk to docker app Ollama at `http://127.0.0.1:11435` (`BROS_OLLAMA_PORT`) and host Ollama at `http://127.0.0.1:<probe>`. Whisper STT uses `http://127.0.0.1:8090`. Container `bros-ui` uses Docker DNS. Docker app Compose always gets `BROS_DATA_DIR` (checkout `data/`).

```bash
pnpm --dir app install
pnpm --dir app ui:dev
pnpm --dir app test:ci
pnpm --dir app typecheck
cargo test --manifest-path cli/Cargo.toml
```

`test:ci` is unit + nuxt (GitHub Actions on a pull request to `main`). Full `pnpm --dir app test` also runs e2e, which needs Bros already listening on `http://127.0.0.1:3055`.

Login passkey is printed in `$BROS_DATA_DIR/var/logs/bros.log` (`[bros] passkey:`) and stored in `$BROS_DATA_DIR/passkey`.

Website/docs site: [Docs site](/docs/website.md). Images build `@bros/ui` only; Pages builds `@bros/website`.

## Workspace (pnpm)

pnpm workspace root is `app/`.

| Path | Package | Role |
| --- | --- | --- |
| `cli/` | — | Rust CLI. Starts and stops the desktop and the UI. Calls the API after `/api/health`. |
| `app/ui/` | `@bros/ui` | Bros UI + Nitro API; extends theme + docs; `/` **= dashboard** |
| `app/layers/docs/` | `@bros/docs` | Docs layer — content from `docs/`, `/docs` routes; extends theme |
| `app/layers/theme/` | `@bros/theme` | Nuxt UI, layouts, nav chrome, markdown/prose |
| `app/website/` | `@bros/website` | Static site homepage + `extends`; `pnpm --dir app docs:generate` → GitHub Pages `/bros/` |
| `lib/apps/` | — | Shipped docker app packages (core Ollama and Whisper, plus addons). An addon can later move to core. |
| `data/config/apps/` | — | Custom apps. Not in the repo. A custom app can later move to addon or core. |

```text
theme  →  docs  →  @bros/ui     (`/` = dashboard)
                →  @bros/website (`/` = marketing)
```

## Where code lives

CLI code is `cli/`. Nuxt app is `app/ui`. Nitro is `app/server` (`serverDir`). Do not import Vue code from server code, or server code from Vue code.

HTTP routes stay in `app/server/api/<surface>/`. A new route is a thin handler. Behavior behind it goes in the matching utils folder.

Folder a concept when it already has three or more files. A single file stays flat at `app/server/utils/`.

```text
app/server/api/          HTTP seam (auth, chat, providers, settings, apps, …)
app/server/utils/
  providers/             index, presets, view, Ollama host/library/pulls
  settings/              enable_host_ollama, enable_whisper
  chat/                  chat, chat settings, titles, stats, specialist
  docker-app/            discover, data seed, proxy, Ollama must-run
  config.ts              bootstrap YAML
app/ui/pages/           /, /chat, /providers, /apps, /status, /settings, /login, /setup
app/ui/utils/
  providers/             Ollama label, disabled models, pull name
  docker-app/            host links, busy, source label
```

The CLI is the Rust binary in `cli/`. Usage: [bros](/docs/cli.md).

## Branches

Cut a feature branch from `main`. Open the pull request against `development`. That pull request runs the JS and Rust tests. It does not build release binaries. When those checks pass, automation merges the pull request into `development` and deletes the feature branch. It does not merge a pull request into `main`.

Open the pull request from `development` into `main` when you want a release. Bump does not rename the pull request. Actions shows the title you set on the run. Merge that yourself. A push to `development` does not open that pull request and does not publish. After the merge, automation fast-forwards `development` to `main`. If it cannot, it stops and does not force-push.

The version bump runs on a pull request into `main` only. A pull request into `development` does not bump `VERSION`. Source `bros update` fast-forwards when the checkout branch is `main` or `development`. Any other branch skips the pull and still rebuilds. There is no `--branch` flag.

## Release

Product version is `0.0.1`. `lib/apps/core/ollama/BROS_MODEL_VERSION` is `1.0.0`. The next merge to `main` publishes `v0.0.1` without bumping. After `v0.0.1` and bros-model `v1.0.0` exist, commit types on a pull request into `main` bump the version on that branch and the merge publishes the tag. A pull request into `development` does not bump. Details: [STACK.md](https://github.com/jasenmichael/bros/blob/main/STACK.md) in the repo root.
