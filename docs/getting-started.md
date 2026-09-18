---
title: Getting started
description: Install Bros with Docker, run bros, open port 3055.
---

# Getting started

Bros is a Docker-isolated local AI control plane. Chat, Models, and Sidecars on one host. The host needs Docker and Docker Compose. Optional: host `cloudflared` for a Cloudflare tunnel (install + `cloudflared login`). See [Tunnel](/docs/tunnel).

The `bros` CLI defaults to **start** when no command is passed.

## Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Optional systemd user service (Linux):

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
```

Full install details: [Install](/docs/install).

## Run

```bash
bros
```

Open [http://127.0.0.1:3055](http://127.0.0.1:3055). Login passkey is printed in the container logs at startup (`[bros] passkey: …`) and stored in `$BROS_HOME/data/passkey`.

```bash
bros -D
bros stop
bros status
```

Ctrl+C on an interactive start stops the **full stack**. First start brings up the Ollama sidecar and installs the internal `bros` model when the packaged GGUF is present.

## Next

- [App](/docs/app) — Dashboard, Chat, Models, Sidecars, Status, Settings, Docs
- [Models](/docs/models) — Ollama, Popular services, Custom providers
- [Sidecars](/docs/sidecars) — core Compose packages plus custom drop-ins
- [Configuration](/docs/configuration) — bootstrap YAML and `$BROS_HOME`
- [Environment](/docs/environment) — `BROS_*` catalog
- [Tunnel](/docs/tunnel) — host `cloudflared`, install, login
- [Development](/docs/development) — `pnpm dev` for contributors
