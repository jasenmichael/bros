# Bros

**B**oxed **R**untime **O**rchestration **S**ystem — manages Docker containers for local AI applications and development, and runs a desktop in the browser.

## Install

A release needs Docker. It does not need git, cargo, or Node.

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

That unpacks `bros-<os>-<arch>.tar.gz` into `~/.bros` (`BROS_DIR`; `BROS_HOME` is an alias) and symlinks `~/.local/bin/bros` (`BROS_BIN`) to `$BROS_DIR/bros`. It does not build; the binary is in the tarball. The tarball has the prebuilt UI and that `bros` binary for this machine. It does not include `src/` sources. Config the app reads is `$BROS_DIR/data/config/bros.yml`. `bros update` downloads the next tarball (`BROS_RELEASE_URL` overrides the exact URL) and keeps `data/`.

Install from source when you have git and cargo (`--from-src` is optional; the default release path never builds):

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --from-src
```

That clones [jasenmichael/bros](https://github.com/jasenmichael/bros) into `~/.bros`, builds `cli/`, points `$BROS_DIR/bros` at `cli/target/release/bros`, and symlinks `BROS_BIN` the same way as a release install. `bros update` pulls and rebuilds that binary, then rebuilds the image through the API. Dev still needs host `pnpm`.

Optional systemd user service:

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
```

Docs: [https://jasenmichael.github.io/bros/](https://jasenmichael.github.io/bros/)

## Quick start

```bash
bros
```

Default action is **start**. Commands and flags: [docs/cli.md](docs/cli.md). Open [http://127.0.0.1:3055](http://127.0.0.1:3055)

Checkout build: [Build and run](#build-and-run-checkout). Hot-reload: [Development](#development-hot-reload).

Optional host `cloudflared` (install + `cloudflared login`). Set `public_url` in `$BROS_DIR/data/config/bros.yml` to start a named tunnel for that hostname.

## Build and run (checkout)

Needs Docker, host `pnpm`, and `cargo`. Builds the host CLI + UI, then starts production mode (prebuilt UI, not Vite). Does not create `~/.local/bin/bros`.

```bash
pnpm --dir src install
scripts/build.sh
./bros
# http://127.0.0.1:3055
```

Do not set `BROS_DEV=1` and do not pass `--dev`. Useful flags: `./bros -D`, `./bros --use-runner`, `./bros stop`. Full notes: [docs/development.md](docs/development.md).

A GitHub release publishes one tarball per OS/arch (`bros-linux-amd64`, …) with that binary and `src/ui/.output`. Product version is `0.0.1`. Local pack (no bump): `scripts/pack-release.sh --target …` after a targeted cargo build. Merge to `main` publishes; there is no local release command. See [STACK.md](STACK.md).

When `cli/src/main.rs` is newer than `cli/target/release/bros`, the CLI rebuilds once and re-execs. A release tree never calls cargo. Operator lines stay on the terminal; compose/UI detail goes to `$BROS_HOST_DATA_DIR/var/logs/bros.log` (`[bros] passkey:`).

## Development (hot-reload)

Same deps. Vite UI on the host. Never starts `bros-ui`. `--use-runner` / `BROS_USE_RUNNER=1` with dev errors.

```bash
pnpm --dir src install
BROS_DEV=1 ./bros
# or: ./bros --dev
# http://127.0.0.1:3055
```

If `./bros` is missing, run `scripts/build.sh` once first. Ctrl+C stops the stack. `-D` is ignored. After Dockerfile or compose changes: `BROS_DEV=1 ./bros update`.

Docs and tests use the same workspace (`src/`):

```bash
pnpm --dir src docs:dev
pnpm --dir src test
```

Docs site: [http://127.0.0.1:3056/bros/](http://127.0.0.1:3056/bros/). Full notes: [docs/development.md](docs/development.md).

## Data directory

When running `bros` with `BROS_DIR` unset, `BROS_DIR` is the real directory of the `bros` binary (symlink-aware: `~/.local/bin/bros` → `$BROS_DIR/bros`). `BROS_HOME` is an alias. Persistent binds live under `$BROS_DIR/data` (`BROS_HOST_DATA_DIR`, mounted at `/app/data`):

- `$BROS_HOST_DATA_DIR` → container `/app/data` (SQLite, config, secrets)
- `$BROS_HOST_DATA_DIR/home` → Desktop `$HOME` (`/home/bros`). A docker app mounts only the home paths its pack lists
- `$BROS_HOST_DATA_DIR/home/workspace` → `$HOME/workspace` on Desktop. `bros.yml` `workspace` or `BROS_HOST_WORKSPACE` replaces the host path. A docker app gets that directory only when its pack lists `workspace`
- `$BROS_HOST_DATA_DIR/home/.local/app-bins` → Desktop `$PATH` (app launch.sh wrappers)
- `$BROS_HOST_DATA_DIR/home/.ollama` → Ollama `$HOME/.ollama` (downloaded models)
- `$BROS_HOST_DATA_DIR/apps/ollama/bros-model` → Ollama `/bros-model` (packaged specialist, read-only)
- `$BROS_HOST_DATA_DIR/home/.config/Cursor` and `home/.cursor` → Cursor app. `home/.config/cursor` and `home/.local/share/cursor-agent` → Agent app. Desktop mounts all of `home`
- `$BROS_HOST_DATA_DIR/home/.config/opencode`, `home/.local/share/opencode`, `home/.local/state/opencode` → OpenCode `$HOME`
- `$BROS_HOST_DATA_DIR/home/.pi` → Pi `$HOME/.pi`
- `$BROS_HOST_DATA_DIR/home/.cache/huggingface` → OpenJEV. Whisper mounts `hub` inside that tree
- `$BROS_HOST_DATA_DIR/apps/openwebui/data` → Open WebUI data
- `$BROS_HOST_DATA_DIR/apps/firecrawl/{postgres,redis,rabbitmq}` → Firecrawl service data

In-container data is `/app/data` (`BROS_DIR=/app`). Do not commit `data/`, `.nuxt`, or `node_modules`.

## Providers

On **Providers**: **Ollama** (docker app + host, cards load collapsed; Chat on by default), **Popular services** (twelve OpenAI-compat clouds — paste a key; Chat off until the key probes healthy), then **Custom providers**. Each card has a Chat switch that only hides that provider from the Chat picker. Each installed Ollama model has its own Chat switch plus a confirm-before-delete ban icon. Popular catalog rows have the same per-model Chat switch and no delete. Details: [docs/providers.md](docs/providers.md).

**Settings** Chat fields edit the `rules` and `personality` skills. They apply on Chat turns only — never on internal `bros` titles. Details: [docs/settings.md](docs/settings.md), [docs/chat.md](docs/chat.md).

Pull on an Ollama card, or type any valid Ollama name. Progress stays on that provider’s model list (survives leaving the page). **Yours** keeps names you add. Recommended tags are **≤ 16 GB**. Docker app DNS is `http://ollama:11434` (host publish **11435**; Compose-app Chat uses DNS, not the publish port). Docker app compose sets `OLLAMA_NOPRUNE=1`; run host Ollama with the same env so incomplete pulls are not pruned. Host Ollama is a separate Chat/Providers row, **off by default** (Settings → Enable host Ollama). Host pull/chat use the host Ollama disk.

### Internal specialist (`bros`)

Bros ships a small internal Ollama model named `bros` for app jobs (auto-titling chats). It is **not** listed in Chat or Providers. Source: [jasenmichael/bros-model](https://github.com/jasenmichael/bros-model). A source checkout installs the packaged GGUF into the Ollama docker app on first start. A release tarball does not include `vendor/bros-model`. See [docs/apps/ollama.md](docs/apps/ollama.md).

## Workspace (pnpm)


| Path                | Package         | Role                                                                                                 |
| ------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `cli/`              | —               | Rust CLI. Starts and stops the desktop and the UI. Calls the API after `/api/health`.                |
| `src/ui/`           | `@bros/ui`      | Bros UI + Nitro API; extends theme + docs; `/` **= dashboard**                                       |
| `src/layers/docs/`  | `@bros/docs`    | Docs layer — content from `docs/`, `/docs` routes; extends theme                                     |
| `src/layers/theme/` | `@bros/theme`   | Nuxt UI, layouts, nav chrome, markdown/prose                                                         |
| `src/website/`      | `@bros/website` | Static site homepage + `extends`; `pnpm --dir src docs:generate` → GitHub Pages `/bros/`             |
| `lib/apps/`         | —               | Shipped docker app packages (core Ollama and Whisper, plus addons). An addon can later move to core. |
| `data/config/apps/` | —               | Custom apps. Not in the repo. A custom app can later move to addon or core.                          |


```text
theme  →  docs  →  @bros/ui     (`/` = dashboard)
                →  @bros/website (`/` = marketing)
```

See [SPEC.md](./SPEC.md), [STACK.md](./STACK.md), [PLAN.md](./PLAN.md), [DESIGN.md](./DESIGN.md).