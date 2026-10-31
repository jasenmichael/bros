---
title: Environment
description: Vars a user can set in .env, with defaults.
---

# Environment

No `.env` is needed for defaults. `./bros` and Compose apply the defaults below when a var is unset. Repo-root `example.env` lists each one commented. Install copies `example.env` to `.env` when `.env` is absent and leaves `example.env` in place. To override, uncomment the line in `.env`. A same-line ` # comment` is ignored. `$HOME`, `${HOME}`, and a leading `~` expand from the process environment. `$BROS_DIR` / `${BROS_DIR}` expand when resolving `BROS_DATA_DIR`. After expand, `BROS_DATA_DIR` (and a set `BROS_WORKSPACE`) must be absolute and must not contain `$` or `#` — otherwise the CLI exits before Compose can create junk under `BROS_DIR`. A var already set in the shell wins. Empty values are skipped. A local `.env` is gitignored. `bros update` refreshes `example.env` and does not replace an existing `.env`.

The `.env` file is read from the **real binary’s directory** (follow the `BROS_BIN` symlink). It is never read from the symlink’s directory.

Server settings live in `$BROS_DIR/bros.yml`. Chat prepend and assistant description are the `rules` and `personality` skill files. Provider keys and chat history live in SQLite. There is no Providers key bootstrap. Paste those keys on Providers.

`BROS_DIR` inside the container stays `/app`.

## Host

`install.sh` defaults `BROS_DIR` to `~/.bros` (binary location). At runtime, shell `BROS_DIR` wins, else `.env`, else the directory of the real binary (checkout → repo root; install → `~/.bros`).

| Variable | Default | Role |
| --- | --- | --- |
| `BROS_DIR` | real binary directory | Install / app root |
| `BROS_BIN` | `$HOME/.local/bin/bros` | Symlink to `$BROS_DIR/bros` (install only) |
| `BROS_DATA_DIR` | `$BROS_DIR/data` | Persistent binds + UI data. On the host and in Desktop (for nested Compose) this is the **host** absolute path. In-container UI files use `/app/data`. |
| `BROS_WORKSPACE` | `$BROS_DATA_DIR/home/workspace` | Desktop workspace bind. A set value wins over `bros.yml` `workspace`. |
| `BROS_PORT` | `3055` | UI host port |
| `BROS_HOST` | `0.0.0.0` | UI listen address. `127.0.0.1` stays on this machine |
| `BROS_APPS_ENABLED` | empty | Comma list of addon docker app ids to start on boot (union with SQLite Autostart). Ollama always starts. Whisper follows Settings. |
| `BROS_PUBLIC_URL` | empty | Wins over YAML `public_url` / tunnel host |

Host Ollama and Whisper toggles are Settings / `bros.yml` (`enable_host_ollama`, `enable_whisper`), not `.env`.

## Local smoke

`pnpm --dir src test:smoke` (or `scripts/smoke-install.sh`) packs a local release tarball, installs it in a reused Docker guest, starts, and uninstalls. Needs Docker, cargo, and pnpm. **Not** part of `test:ci` or GitHub Actions.
