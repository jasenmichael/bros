# Bros

**B**oxed **R**untime **O**rchestration **S**ystem — manages Docker containers for local AI applications and development, and runs a desktop in the browser.

## Install

A release needs Docker. It does not need git, cargo, or Node.

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

That unpacks `bros.tar.gz` into `~/.bros` (`BROS_DIR`; `BROS_HOME` is an alias) and symlinks `~/.local/bin/bros`. Config the app reads is `$BROS_DIR/data/config/bros.yml`. `bros update` downloads the next tarball (`BROS_RELEASE_URL` overrides) and keeps `data/`.

Install from source when you have git and cargo:

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --from-src
```

That clones [jasenmichael/bros](https://github.com/jasenmichael/bros) into `~/.bros`, builds `cli/`, and symlinks `bros` to `cli/target/release/bros`. `bros update` pulls and rebuilds that binary, then rebuilds the image through the API. Dev still needs host `pnpm`.

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

Production: [Production](#production). A contributor checkout: [Development](#development).

Optional host `cloudflared` (install + `cloudflared login`). Set `public_url` in `$BROS_DIR/data/config/bros.yml` to start a named tunnel for that hostname.

## Production

Build the CLI and the UI host. These two commands do not build container images. The CLI build is one program for the host OS and architecture. There is no directory of builds for other systems.

```bash
cargo build --release --manifest-path cli/Cargo.toml
pnpm --dir src --filter @bros/ui build
```

The CLI program is `cli/target/release/bros`. The UI host files are `src/ui/.output`. The server file is `src/ui/.output/server/index.mjs`.

In a checkout, `bros` at the repo root is a symlink to that one host program. The symlink lets `./bros` find the repo. It is not a release directory.

Run the production start. Do not set `BROS_DEV=1` and do not pass `--dev`.

```bash
./bros
./bros -D
./bros stop
```

`./bros` starts the Desktop, the UI host, and docker apps. When `src/ui/.output/server/index.mjs` is already there, the UI host runs that file. It does not run `pnpm --filter @bros/ui dev`. The Desktop start still uses `compose up --build`. That image build is separate from the two commands above. Foreground `./bros` owns the terminal. Ctrl+C stops that stack and prints `Bros exited.` `./bros -D` leaves the UI host running after the command exits. `./bros stop` stops it.

Docker is required for the Desktop and docker apps. A release tree has no `cli/Cargo.toml` and runs the UI host in container `bros-ui`. A source prod start uses the host UI host when `pnpm` is on `PATH`, otherwise `bros-ui`. Only one UI host runs.

When `cli/src/main.rs` is newer than `cli/target/release/bros`, the CLI runs `cargo build --release` and starts the new program once. A release tree never calls cargo. Help (`-h`) and version (`-v`) print without Docker, pnpm, or cargo.

Operator lines stay on the terminal. Compose, BuildKit, and UI output append to `$BROS_HOST_DATA_DIR/var/logs/bros.log`. The login passkey is in that log (`[bros] passkey:`).

## Development

Contributors need Docker, host `pnpm`, and `cargo`. Dev always runs the UI on the host. Dev never starts `bros-ui`.

```bash
BROS_DEV=1 ./bros
./bros --dev
```



The UI is `pnpm --dir src --filter @bros/ui dev`. Ctrl+C stops the desktop, the UI, and docker apps. `-D` is ignored in dev.

After Dockerfile or compose changes:

```bash
BROS_DEV=1 ./bros update
```

Docs and tests use the same host pnpm. The workspace root is `src/`.

```bash
pnpm --dir src install
pnpm --dir src ui:dev
pnpm --dir src docs:dev
pnpm --dir src test
```

Docs site: [http://127.0.0.1:3056/bros/](http://127.0.0.1:3056/bros/) ([docs/website.md](docs/website.md)). Full notes: [docs/development.md](docs/development.md).

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

Bros ships a small internal Ollama model named `bros` for app jobs (auto-titling chats). It is **not** listed in Chat or Providers. Source: [jasenmichael/bros-model](https://github.com/jasenmichael/bros-model). Packaged GGUF installs into the Ollama docker app on first start. See [docs/apps/ollama.md](docs/apps/ollama.md).

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