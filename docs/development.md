---
title: Development
description: Docker bind-mount hot-reload with pnpm dev.
---

# Development

Contributors: Docker Engine + Compose. The user CLI is `bros`. Hot-reload is `pnpm dev` (`BROS_DEV=1`).

## Docker bind-mount (`pnpm dev`)

```bash
pnpm dev
# http://127.0.0.1:3055
```

Bind-mount stack. First start builds `bros:dev` if it is missing. Later starts skip rebuild. Ctrl+C stops the full stack (core + sidecars).

After Dockerfile or compose changes:

```bash
pnpm dev:update
```

Stop a leftover stack:

```bash
BROS_DEV=1 ./bros stop
```

## Host Node (optional)

Node **22+**, pnpm **9.15**. Docker still needed for sidecars via the socket. Chat/Providers talk to sidecar Ollama at `http://127.0.0.1:11435` and host Ollama at `http://127.0.0.1:<probe>` (not `ollama` / `host.docker.internal`). Sidecar Compose always gets `BROS_HOST_DATA_DIR` (checkout `data/`); an empty value used to bind host `/ollama` instead of `$BROS_HOME/data/ollama`.

```bash
pnpm install
pnpm app:dev
pnpm test
```

Login passkey is printed in the container logs at startup (`[bros] passkey: …`) and stored in `$BROS_HOST_DATA_DIR/passkey`.

Website/docs site: [Docs site](/docs/website).
