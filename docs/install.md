---
title: Install
description: install.sh, BROS_HOME, first start, and the bros command.
---

# Install

A release needs Docker. It unpacks `bros.tar.gz` into `~/.bros` and symlinks `~/.local/bin/bros`. `bros update` downloads the next tarball (`BROS_RELEASE_URL`) and keeps `data/`.

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

A source install needs git and cargo once. After that, runtime is Docker. Dev still needs host `pnpm`.

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --from-src
```

That clones https://github.com/jasenmichael/bros.git into `~/.bros` (`BROS_DIR`; `BROS_HOME` is an alias), builds `cli/`, and points `bros` at `cli/target/release/bros`. Source `bros update` pulls, rebuilds the CLI, then rebuilds the image through the API. A release runs the UI in container `bros-ui`. A source prod start uses host `pnpm` when it is on `PATH`.

Optional systemd user service (Linux):

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
```

`install.sh` default path does not clone. The app reads `$BROS_DIR/data/config/bros.yml`. The installer still writes `~/.config/bros.yml` until a later pass; that file is not loaded. `BROS_BIN` is `~/.local/bin/bros`, a symlink to `$BROS_DIR/bros`.

Overrides:

- `BROS_HOME` / `BROS_DIR` — install directory (default `~/.bros`)
- `BROS_RELEASE_URL` — release tarball
- `BROS_REPO` — git clone URL for `--from-src`
- `BROS_REF` — git ref for `--from-src` (default `main`)
- `BROS_CONFIG` — bootstrap YAML (default `~/.config/bros.yml`)
- `BROS_BIN` — PATH symlink (default `~/.local/bin/bros`)

Running `bros` with `BROS_DIR` unset sets `BROS_DIR` to the real directory of the binary (so a checkout `./bros` or a `BROS_BIN` symlink both resolve correctly). Persistent binds live under `$BROS_HOME/data` (`$BROS_HOST_DATA_DIR`).

Docs site: https://jasenmichael.github.io/bros/

## First start

```bash
bros
```

Interactive start. Ctrl+C stops the full stack: the UI, docker apps, then container `bros`. UI autostart brings up the Ollama docker app and installs the internal `bros` model when the packaged GGUF is present. The CLI does not do that itself.

Commands and flags: [bros](/docs/cli).

Open [http://127.0.0.1:3055](http://127.0.0.1:3055) (`BROS_HOST`:`BROS_PORT`). The passkey is printed in `$BROS_HOST_DATA_DIR/var/logs/bros.log` (`[bros] passkey:`).

Contributor hot-reload is `BROS_DEV=1 ./bros` or `./bros --dev` (host `pnpm` and `cargo`). See [Development](/docs/development).
