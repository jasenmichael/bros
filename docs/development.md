---
title: Development
description: Docker bind-mount hot-reload with BROS_DEV=1 ./bros or ./bros --dev.
---

# Development

Contributors: Docker Engine + Compose. The user CLI is `bros`. Hot-reload is `BROS_DEV=1 ./bros` or `./bros --dev`. The pnpm workspace root is `src/`.

## Docker bind-mount

```bash
BROS_DEV=1 ./bros
./bros --dev
# http://127.0.0.1:3055  (BROS_HOST:BROS_PORT)
```

Bind-mount stack. First start builds `bros:dev` if it is missing. Later starts skip rebuild. Ctrl+C stops the full stack (core + sidecars).

After Dockerfile or compose changes:

```bash
BROS_DEV=1 ./bros update
```

Stop a leftover stack:

```bash
BROS_DEV=1 ./bros stop
```

## Host Node (optional)

Node **22+**, pnpm **12.15.0**. Docker still needed for sidecars via the socket. Chat/Providers talk to sidecar Ollama at `http://127.0.0.1:11435` (`BROS_OLLAMA_PORT`) and host Ollama at `http://127.0.0.1:<probe>` (not `ollama` / `host.docker.internal`). Whisper STT uses `http://127.0.0.1:8090`. Compose app uses Docker DNS. Sidecar Compose always gets `BROS_HOST_DATA_DIR` (checkout `data/`).

```bash
pnpm --dir src install
pnpm --dir src ui:dev
pnpm --dir src test
```

Login passkey is printed in the container logs at startup (`[bros] passkey: …`) and stored in `$BROS_HOST_DATA_DIR/passkey`.

Website/docs site: [Docs site](/docs/website). The app container installs `@bros/ui` and `@bros/cli` only; Pages builds `@bros/website`.

## Where code lives

Host command code is `src/cli`. Nuxt app is `src/ui`. Nitro is `src/server` (`serverDir`). Do not import Vue code from server code, or server code from Vue code.

HTTP routes stay in `src/server/api/<surface>/`. A new route is a thin handler. Behavior behind it goes in the matching utils folder.

Folder a concept when it already has three or more files. A single file stays flat at `src/server/utils/`.

```text
src/server/api/          HTTP seam (auth, chat, providers, settings, sidecars, …)
src/server/utils/
  providers/             index, presets, view, Ollama host/library/pulls
  settings/              enable_host_ollama, enable_whisper
  chat/                  chat, chat settings, titles, stats, specialist
  sidecars/              discover, data seed, proxy, Ollama must-run
  config.ts              bootstrap YAML
src/ui/pages/           /, /chat, /providers, /sidecars, /status, /settings, /login, /setup
src/ui/utils/
  providers/             Ollama label, disabled models, pull name
  sidecars/              host links, busy, source label
```

Host `bros` is a Docker launcher. The host command code is `src/cli`. Usage: [bros](/docs/cli).
