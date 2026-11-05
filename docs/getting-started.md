---
title: Getting started
description: Install Bros with Docker, run bros, open the default address.
---

# Getting started

Bros is a Docker-isolated local AI control plane. Chat, Providers, and Docker apps on one host. The host needs Docker and Docker Compose. Optional: host `cloudflared` for a Cloudflare tunnel (install + `cloudflared login`). See [Tunnel](/docs/tunnel.md).

The `bros` CLI defaults to **start** when no command is passed.

## Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Source, a branch, or the service: [Install](/docs/install.md). Remove Bros: [Uninstall](/docs/uninstall.md).

## Run

```bash
bros
```

Open [http://127.0.0.1:3055](http://127.0.0.1:3055) (`BROS_HOST`:`BROS_PORT`). Login passkey is printed in the container logs at startup (`[bros] passkey: …`) and stored in `$BROS_DIR/data/passkey`.

Commands and flags: [bros](/docs/cli.md).

Ctrl+C on an interactive start stops the **full stack**. First start brings up the Ollama docker app and installs the internal `bros` model when the packaged GGUF is present.

## Next

- [Install](/docs/install.md) — release, source, branch, service
- [Uninstall](/docs/uninstall.md) — remove a release install
- [Development](/docs/development.md) — separate clone on branch `development`, or the same commands from the install root
- [App](/docs/app.md) — Dashboard, Chat, Providers, Docker apps, Status, Settings, Docs
- [Providers](/docs/providers.md) — Ollama, Popular services, Custom providers
- [Docker apps](/docs/apps.md) — Core Ollama and Whisper, then addon, custom, and repo packs
- [Configuration](/docs/configuration.md) — bootstrap YAML and `$BROS_DIR`
- [Environment](/docs/environment.md) — `BROS_*` catalog
- [Tunnel](/docs/tunnel.md) — host `cloudflared`, install, login

