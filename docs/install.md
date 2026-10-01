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

`install.sh` clones https://github.com/jasenmichael/bros.git into `~/.bros` (`BROS_DIR`; `BROS_HOME` is an alias). The app reads `$BROS_DIR/bros.yml`. The installer still writes `~/.config/bros.yml` until a later pass; that file is not loaded. `BROS_BIN` is `~/.local/bin/bros`, a symlink to `$BROS_DIR/bros`.

Overrides:

- `BROS_HOME` / `BROS_DIR` — install directory (default `~/.bros`)
- `BROS_REPO` — git clone URL
- `BROS_REF` — git ref (default `main`)
- `BROS_CONFIG` — bootstrap YAML (default `~/.config/bros.yml`)
- `BROS_BIN` — PATH symlink (default `~/.local/bin/bros`)

Running `bros` with `BROS_DIR` unset sets `BROS_DIR` to the real directory of the script (so a checkout `./bros` or a `BROS_BIN` symlink both resolve correctly). Persistent binds live under `$BROS_HOME/data` (`$BROS_HOST_DATA_DIR`).

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

Contributor hot-reload is `BROS_DEV=1 ./bros`, not a user CLI flag. See [Development](/docs/development).
