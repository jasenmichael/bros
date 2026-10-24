---
title: bros
description: bros commands, flags, and which Docker entry each command uses.
---

# bros

Host `bros` only needs Docker. It picks the dev or prod compose file, starts a container, and forwards the remaining arguments to `src/cli` in that image. `BROS_DEV=1` or `--dev` selects the dev compose file.

Three entries:

| Entry | When |
| --- | --- |
| Full start | No command, or `start`. `docker compose up` of Bros and the sidecars. Prod uses `--build`. Dev does not. |
| One-off | `stop`, `status`, `restart`, `check`, `update` / `upgrade`, `service`, `--help`, `--version`. `docker compose run --rm` (no host port). The container exits. Sidecars are not started for these, except `restart`, which stops and then does a full start. |
| Exec | `run` and `shell`, only when container `bros-desktop` is already up. They do not start the stack. |

## Commands

| Command | Entry | What it does |
| --- | --- | --- |
| `start` | Full start | Same as `bros` with no command. Shows a `Starting UI…` spinner until `/api/health` answers, then prints `http://<host>:<port>` and, when a tunnel URL is set, that URL on the next line. After compose is up, the Ollama sidecar starts if needed and the internal `bros` model is stamped. A stamp miss warns and does not fail the start. |
| `stop` | One-off | Stop every `bros-sc-*` sidecar and `bros-desktop`, then the core container. Prints `Bros exited.` and exits 0. Does not create data dirs. Container ids print only with `--verbose`. |
| `status` | One-off | Compose ps and the health check. |
| `restart` | One-off, then full start | Stop, then the same start as `bros start`. |
| `check` | One-off | Look for git, image, and model updates. Prompt before updating when stdin is a TTY. |
| `update` | One-off | Git pull and submodule on the host, then a rebuild of the app and Desktop images. The local `bros` image is built, not pulled from a registry. A base already present at its pinned digest is reused. A missing base is pulled once. Model stamp when Ollama is already up. Replaces a running `bros` container and a running Desktop container. Does not start either when it is stopped. Does not pull or replace other sidecars. Alias: `upgrade`. |
| `service install` | One-off | Linux systemd --user unit. `ExecStart` is `bros -D`. |
| `service uninstall` | One-off | Disable and remove that unit. |
| `service status` | One-off | `systemctl --user status bros`. |
| `run <command>` | Exec | Run that command in container `bros-desktop` (service `desktop`, workdir `$HOME/workspace`). Example: `bros run agent`. |
| `shell` | Exec | Open the Bros terminal on the host. Same container and `bash` as `/terminal`. |
| `app check <id>` | One-off | Check one package app or sidecar app. Prints the installed version, then `Update available` or `Up to date`. A run command has no version check. A deb URL reports an update only when a path segment is `latest` and the resolved URL changed. |
| `app update <id>` | One-off | Update that app. A package app uses its package manager. A run app writes a force stamp and rebuilds Desktop so that curl runs again. A registry sidecar image pulls and recreates. A local image (compose `build`, no registry in the name) rebuilds and recreates. Check on a local image does not pull. |

If `bros-desktop` is not running, `run` and `shell` exit and tell you to start Bros.

## Options

| Flag | What it does |
| --- | --- |
| `--dev` | Dev compose (`docker-compose.dev.yml`). Same as `BROS_DEV=1`. |
| `-D`, `--daemon` | Full start in the background: `docker compose up --build -d`. Ignored when dev is on. Dev stays in the foreground. |
| `-i`, `--interactive` | Foreground full start. Default. One Ctrl+C or SIGTERM stops the full stack (tunnel helper, sidecars, then core), prints `Bros exited.`, and exits 0. A second Ctrl+C exits 130. |
| `-c`, `--config PATH` | Host `bros.yml` mounted at `/app/bros.yml`. Read on the full-start path. |
| `--verbose` | Show the Docker compose log prefix, including `Image … Building` / `Built`. Output stays prefixed with `[bros]`. Image-build step lines and the Nitro file list stay hidden. A failed build still prints the error. |
| `-h`, `--help` | This file, with the YAML frontmatter removed. |
| `-v`, `--version` | Version. |

## Env

| Name | What it changes |
| --- | --- |
| `BROS_DIR` | App directory. Default: directory of the `bros` script, symlink-resolved. |
| `BROS_HOME` | Alias for `BROS_DIR`. |
| `BROS_PORT` | App host port. Default `3055`. |
| `BROS_HOST` | App host address. Default `0.0.0.0`. |
| `BROS_DEV=1` | Dev compose. Same as `--dev`. |

`BROS_BIN` defaults to `~/.local/bin/bros`. Data binds default to `$BROS_HOME/data` (`BROS_HOST_DATA_DIR`).

`--verbose` sets `BROS_VERBOSE=1`. `-D` sets `BROS_DAEMON=1`. `./bros` overwrites both from those flags, so `.env` cannot.

## Examples

```bash
bros
bros -D
bros shell
bros run agent
```

```bash
BROS_DEV=1 ./bros
./bros --dev
```

Install and first start: [Install](/docs/install). Env catalog: [Environment](/docs/environment). YAML keys: [Configuration](/docs/configuration).
