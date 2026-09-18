---
title: Install
description: install.sh, BROS_HOME, first start, and the bros CLI.
---

# Install

Host needs Docker Engine and Docker Compose. No host Node for the production path.

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Optional systemd user service (Linux):

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
```

`install.sh` clones https://github.com/jasenmichael/bros.git into `~/.bros` (`BROS_HOME`). Writes `~/.config/bros.yml` if missing. Symlinks `~/.local/bin/bros` (`BROS_BIN`).

Overrides:

- `BROS_HOME` / `BROS_DIR` — install directory (default `~/.bros`)
- `BROS_REPO` — git clone URL
- `BROS_REF` — git ref (default `main`)
- `BROS_CONFIG` — bootstrap YAML (default `~/.config/bros.yml`)
- `BROS_BIN` — PATH symlink (default `~/.local/bin/bros`)

A repo checkout (CLI next to `docker-compose.yml` + `sidecars/`) uses that directory as `BROS_HOME`. Persistent binds live under `$BROS_HOME/data` (`$BROS_HOST_DATA_DIR`).

Docs site: https://jasenmichael.github.io/bros/

## First start

```bash
bros
```

Interactive production compose. Ctrl+C stops the **full stack**: all `bros-sc-*` sidecars, then core `compose down`. First start brings up the Ollama sidecar and installs the internal `bros` model when the packaged GGUF is present.

```bash
bros -D
```

Same stack, daemonized.

```bash
bros stop
bros status
bros update
bros service status
```

Open [http://127.0.0.1:3055](http://127.0.0.1:3055). Passkey is printed in the container logs (`[bros] passkey: …`).

Contributor hot-reload is `pnpm dev`, not a user CLI flag. See [Development](/docs/development).
