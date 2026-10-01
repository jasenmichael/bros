---
title: CLI
description: bros commands, flags, and where the binary and config live.
---

# CLI

`bros` is one command. With no command it starts the stack.

## Commands

| Command | What it does |
| --- | --- |
| `start` | Same as the default. Production compose is `up --build`. |
| `stop` | Stop Bros core and every `bros-sc-*` sidecar. Data dirs stay. |
| `status` | Compose ps and the health check. |
| `restart` | Stop, then start, with the same flags. |
| `check` | Look for git, image, and model updates. Prompt before updating. |
| `update` | Git pull, submodule, images, rebuild. Alias: `upgrade`. |
| `service install` | Linux systemd --user unit. `ExecStart` is `bros -D`. |
| `service uninstall` | Disable and remove that unit. |
| `service status` | `systemctl --user status bros`. |

## Options

| Flag | What it does |
| --- | --- |
| `-D`, `--daemon` | Background: `docker compose up --build -d`. Ignored when `BROS_DEV=1`. Dev stays in the foreground. |
| `-i`, `--interactive` | Foreground. Default. Ctrl+C / SIGTERM runs compose down. |
| `-c`, `--config PATH` | Host `bros.yml` mounted at `/app/bros.yml`. |
| `-h`, `--help` | Help. |
| `-v`, `--version` | Version. |

`--dev` is gone. Dev is the env var:

```bash
BROS_DEV=1 ./bros
```

## Paths

| Name | Default |
| --- | --- |
| Binary symlink | `~/.local/bin/bros` (`BROS_BIN`) |
| Install tree | `~/.bros` (`BROS_DIR`; `BROS_HOME` is an alias) |
| Bootstrap YAML the runner loads | `$BROS_DIR/bros.yml` |
| Data | `$BROS_HOME/data` (`BROS_HOST_DATA_DIR`) |
| App port | `3055` (`BROS_PORT`) |

`install.sh` also writes `$XDG_CONFIG_HOME/bros.yml` (`~/.config/bros.yml`). The runner loads `$BROS_DIR/bros.yml` unless `-c` points at another file.

Install and first start: [Install](/docs/install). Env catalog: [Environment](/docs/environment). YAML keys: [Configuration](/docs/configuration).
