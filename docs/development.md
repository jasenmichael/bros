---
title: Development
description: Docker bind-mount hot-reload with BROS_DEV=1 ./bros or ./bros --dev.
---

# Development

Contributors need Docker, host `pnpm`, and `cargo`. The CLI is `cli/`. Hot-reload is `BROS_DEV=1 ./bros` or `./bros --dev`. Dev always runs the UI on the host. The pnpm workspace root is `src/`.

## Production build

Build the CLI and the UI host for this machine. These commands do not build container images. `cargo` writes one program for the host OS and architecture. There is no directory of builds for other systems.

```bash
cargo build --release --manifest-path cli/Cargo.toml
pnpm --dir src --filter @bros/ui build
```

The CLI program is `cli/target/release/bros`. The UI host files are `src/ui/.output`.

`bros` at the repo root is a symlink to that host program. Use it to run. Do not set `BROS_DEV=1` and do not pass `--dev`.

```bash
./bros
```

When `src/ui/.output/server/index.mjs` is already there, the UI host runs that file. The Desktop start still uses `compose up --build`.

## Docker bind-mount

```bash
BROS_DEV=1 ./bros
./bros --dev
# http://127.0.0.1:3055  (BROS_HOST:BROS_PORT)
```

Dev refuses to start when `pnpm` or `cargo` is missing. The desktop container is Selkies. The UI is `pnpm --dir src --filter @bros/ui dev`. Ctrl+C stops the full stack (desktop, UI host, docker apps). `-D` is ignored in dev.

After Dockerfile or compose changes:

```bash
BROS_DEV=1 ./bros update
```

Stop a leftover stack:

```bash
BROS_DEV=1 ./bros stop
```

## Host pnpm

Node **22+**, pnpm **12.15.0**. Dev uses that pnpm for the UI. Docs and tests use the same workspace. Docker is still required for the desktop and docker apps. Chat/Providers talk to docker app Ollama at `http://127.0.0.1:11435` (`BROS_OLLAMA_PORT`) and host Ollama at `http://127.0.0.1:<probe>`. Whisper STT uses `http://127.0.0.1:8090`. Container `bros-ui` uses Docker DNS. Docker app Compose always gets `BROS_HOST_DATA_DIR` (checkout `data/`).

```bash
pnpm --dir src install
pnpm --dir src ui:dev
pnpm --dir src test
```

Login passkey is printed in `$BROS_HOST_DATA_DIR/var/logs/bros.log` (`[bros] passkey:`) and stored in `$BROS_HOST_DATA_DIR/passkey`.

Website/docs site: [Docs site](/docs/website). Images build `@bros/ui` only; Pages builds `@bros/website`.

## Where code lives

CLI code is `cli/`. Nuxt app is `src/ui`. Nitro is `src/server` (`serverDir`). Do not import Vue code from server code, or server code from Vue code.

HTTP routes stay in `src/server/api/<surface>/`. A new route is a thin handler. Behavior behind it goes in the matching utils folder.

Folder a concept when it already has three or more files. A single file stays flat at `src/server/utils/`.

```text
src/server/api/          HTTP seam (auth, chat, providers, settings, apps, …)
src/server/utils/
  providers/             index, presets, view, Ollama host/library/pulls
  settings/              enable_host_ollama, enable_whisper
  chat/                  chat, chat settings, titles, stats, specialist
  docker-app/            discover, data seed, proxy, Ollama must-run
  config.ts              bootstrap YAML
src/ui/pages/           /, /chat, /providers, /apps, /status, /settings, /login, /setup
src/ui/utils/
  providers/             Ollama label, disabled models, pull name
  docker-app/            host links, busy, source label
```

The CLI is the Rust binary in `cli/`. Usage: [bros](/docs/cli).
