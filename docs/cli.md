---
title: bros
description: bros commands, flags, and which process each command uses.
---

# bros

The CLI is a Rust binary in `cli/`. `scripts/build.sh` runs `cargo build --release` for the host OS and architecture, builds the UI, and refreshes the checkout symlink `bros` → `cli/target/release/bros`. It does not create `~/.local/bin/bros`; that path is install-only. Publishing a release is CI only. A release is one tarball per OS and architecture: `bros-linux-amd64`, `bros-linux-arm64`, `bros-darwin-amd64`, `bros-darwin-arm64`. The file inside is always `bros`. A release tree has no `cli/Cargo.toml`, no `src/` sources, and does not need cargo or Node. The UI in that tree is the prebuilt Nitro server at `src/ui/.output`. `-h` and `-v` print this file and the version without Docker, pnpm, or cargo.

Dev (`BROS_DEV=1` or `--dev`) is a source checkout only. It requires host `pnpm` and `cargo`. The UI is always `pnpm --dir src --filter @bros/ui dev` on the host. Dev never starts container `bros-ui`. `--use-runner` or `BROS_USE_RUNNER=1` with dev exits `dev does not use the UI runner`.

Prod uses host Node/pnpm for the UI when available (a release runs `node src/ui/.output/server/index.mjs`; a source checkout uses host `pnpm`). Without host Node/pnpm, or with `--use-runner` / `BROS_USE_RUNNER=1`, container `bros-ui` (compose profile `ui`, Node 26.7.0 plus docker CLI for the host sock) serves that same prebuilt output. One UI at a time. Missing `src/ui/.output` fails the image build or host start.

Container `bros` is the desktop. The UI host listens on `BROS_PORT` (3055). Selkies publishes on `127.0.0.1:${BROS_STREAM_PORT:-3300}`. ttyd publishes on `127.0.0.1:${BROS_TTYD_PORT:-7681}`.

The CLI starts and stops the desktop, the UI, and docker apps. After `/api/health`, `check`, image rebuild, `app check`, `app update`, and writing `apps-compose.yml` are API calls. `run` and `shell` are `docker exec` into container `bros`. `service` is host `systemctl --user`. `status` is the CLI.

Operator lines go to the terminal. Compose, BuildKit, and UI output append to `$BROS_HOST_DATA_DIR/var/logs/bros.log`. `--verbose` also prints those engine lines. Ctrl+C closes that pipe before the stop lines.

Repo root is the directory of `bros`, symlink-resolved. `BROS_HOME` and `BROS_DIR` fill each other. Data is `BROS_HOST_DATA_DIR` or `$BROS_HOME/data`. `BROS_HOST_WORKSPACE` keeps a set value. Otherwise it is `bros.yml` `workspace` when that path is a host path, else `$BROS_HOST_DATA_DIR/home/workspace`. No workspace is exported when the data dir is empty, `/app/data`, or `/data`. Config is `--config`, else `$BROS_HOST_DATA_DIR/config/bros.yml`, else `$BROS_HOME/bros.yml`.

`vendor/bros-model` is initialized by a source install and source `bros update`. A release tarball omits `vendor/`. Install and `bros update` read `lib/apps/core/ollama/BROS_MODEL_VERSION` (`1.0.0` for product `0.0.1`) and download that packaged model when the stamp under `$BROS_HOST_DATA_DIR/apps/ollama/bros-model` is missing or older. A newer stamp stays. `bros` start does not download. The Ollama core app then runs `ollama create bros`. The UI does not run `git submodule`. Install copies `example.env` to `.env` when `.env` is absent and leaves `example.env` in place. `bros update` refreshes `example.env` and keeps an existing `.env`.

## Commands

| Command | What it does |
| --- | --- |
| `start` | Same as `bros` with no command. Starts the UI, waits for `/api/health`, writes `apps-compose.yml` through the API, then desktop `compose up -d --no-deps bros` (prod adds `--build`). Prints the listen URL, LAN URLs, and the tunnel URL when one is set. UI autostart brings up Ollama and stamps the internal `bros` model. |
| `stop` | Stop the UI host, every `bros-*` container, then container `bros`. Prints `Bros exited.` and exits 0. Does not create data dirs. Does not need pnpm or cargo. |
| `status` | Compose ps, `/api/health`, and an Ollama probe. No Node. |
| `restart` | Stop, then start. |
| `check` | `POST /api/apps/check` after `/api/health`. |
| `update` | Release: download `bros-<os>-<arch>.tar.gz` for this machine (`BROS_RELEASE_URL` is the exact tar URL when set), replace the install except `data/` and an existing `.env`, refresh `example.env`, copy `example.env` to `.env` when `.env` is absent, re-exec. Source: on `main`/`master`, `git pull --ff-only` (fails if that pull fails). On any other branch: loud skip. Then `git submodule update --init`, `cargo build --release`, re-exec, then `POST /api/apps/rebuild`. When `lib/apps/core/ollama/BROS_MODEL_VERSION` is set, download that model release if the local stamp is missing or older, start the UI if it is down, and let the Ollama core app create model `bros`. A running `bros` container is replaced with `--no-deps`. Docker apps are not updated. Alias: `upgrade`. |
| `service install` | Linux systemd --user unit. `ExecStart` is `bros -D`. |
| `service uninstall` | Disable and remove that unit. |
| `service status` | `systemctl --user status bros`. |
| `run <command>` | `docker exec` in container `bros` (workdir `/home/bros/workspace`). Example: `bros run agent`. |
| `shell` | `docker exec` `bash` in container `bros`. Same shell as `/terminal`. |
| `app check <id>` | `GET /api/apps/<id>/update` after `/api/health`. |
| `app update <id>` | `POST /api/apps/<id>/update` after `/api/health`. |

If container `bros` is not running, `run` and `shell` exit and tell you to start Bros.

A desktop recreate does not restart docker apps. A docker app restarts when its own compose, image, env, command, or volumes changed, or when that recreate changes a volume host path the app mounts.

## Options

| Flag | What it does |
| --- | --- |
| `--dev` | Dev compose (`lib/desktop/docker-compose.dev.yml`). Same as `BROS_DEV=1`. Requires host pnpm and cargo. |
| `--use-runner` | Prod UI in container `bros-ui` even when host Node/pnpm is on `PATH`. Same as `BROS_USE_RUNNER=1`. Errors when dev is on. |
| `-D`, `--daemon` | Full start in the background. The UI survives exit. Ignored when dev is on. Dev stays in the foreground. |
| `-i`, `--interactive` | Foreground full start. Default. One Ctrl+C or SIGTERM stops the full stack, prints `Bros exited.`, and exits 0. A second Ctrl+C exits 130. |
| `-c`, `--config PATH` | Host `bros.yml`. |
| `--verbose` | Print engine lines on the terminal as well as the log file. |
| `-h`, `--help` | This file, with the YAML frontmatter removed. |
| `-v`, `--version` | Version from `VERSION`, else `src/package.json`, else `0.0.1`. The published tag is `v` plus that number. The current product version is `0.0.1`. |

## Env

| Name | What it changes |
| --- | --- |
| `BROS_DIR` | App directory. Default: directory of `bros`, symlink-resolved. |
| `BROS_HOME` | Alias for `BROS_DIR`. Each fills the other when only one is set. |
| `BROS_HOST_DATA_DIR` | Data directory. Default `$BROS_HOME/data`. |
| `BROS_HOST_WORKSPACE` | Desktop workspace bind. See the resolve rules above. |
| `BROS_PORT` | UI host port. Default `3055`. |
| `BROS_HOST` | UI listen address. Default `0.0.0.0`. |
| `BROS_STREAM_PORT` | Host port for Selkies. Default `3300`, bound to `127.0.0.1`. |
| `BROS_TTYD_PORT` | Host port for ttyd. Default `7681`, bound to `127.0.0.1`. |
| `BROS_DESKTOP_STREAM_ORIGIN` | Proxy target for `/desktop/view/`. |
| `BROS_TERMINAL_ORIGIN` | Proxy target for `/terminal/session`. |
| `BROS_DEV=1` | Dev. Same as `--dev`. |
| `BROS_USE_RUNNER=1` | Prod UI runner. Same as `--use-runner`. |

`BROS_BIN` defaults to `~/.local/bin/bros`.

`--verbose` sets `BROS_VERBOSE=1`. `-D` sets `BROS_DAEMON=1`.

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
./bros --use-runner
BROS_USE_RUNNER=1 ./bros
```

Install and first start: [Install](/docs/install). Env catalog: [Environment](/docs/environment). YAML keys: [Configuration](/docs/configuration).
