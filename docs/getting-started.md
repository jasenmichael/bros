---
title: Getting started
description: Install Bros with Docker, run bros, open the default address.
---

# Getting started

Bros is a Docker-isolated local AI control plane. Chat, Providers, and Docker apps on one host. The host needs Docker and Docker Compose. Optional: host `cloudflared` for a Cloudflare tunnel (install + `cloudflared login`). See [Tunnel](/docs/tunnel).

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

Open [http://127.0.0.1:3055](http://127.0.0.1:3055) (`BROS_HOST`:`BROS_PORT`). Login passkey is printed in the container logs at startup (`[bros] passkey: …`) and stored in `$BROS_DIR/data/passkey`.

Commands and flags: [bros](/docs/cli).

Ctrl+C on an interactive start stops the **full stack**. First start brings up the Ollama docker app and installs the internal `bros` model when the packaged GGUF is present.

## Next

- [Install](/docs/install) — release, source, systemd, overrides
- [Development](/docs/development) — checkout build and `BROS_DEV=1` hot-reload
- [App](/docs/app) — Dashboard, Chat, Providers, Docker apps, Status, Settings, Docs
- [Providers](/docs/providers) — Ollama, Popular services, Custom providers
- [Docker apps](/docs/apps) — Core Ollama and Whisper, then addon, custom, and repo packs
- [Configuration](/docs/configuration) — bootstrap YAML and `$BROS_DIR`
- [Environment](/docs/environment) — `BROS_*` catalog
- [Tunnel](/docs/tunnel) — host `cloudflared`, install, login

