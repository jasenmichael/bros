# Bros

**B**oxed **R**untime **O**rchestration **S**ystem — manages Docker containers for local AI applications and development, and runs a desktop in the browser.

## Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Optional systemd user service:

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
```

Clones [jasenmichael/bros](https://github.com/jasenmichael/bros) into `~/.bros` (`BROS_DIR`; `BROS_HOME` is an alias). Config is `$BROS_DIR/data/config/bros.yml`. Symlinks `~/.local/bin/bros` to `$BROS_DIR/bros`. Docs: https://jasenmichael.github.io/bros/

## Quick start

```bash
bros
```

Default action is **start**. Commands and flags: [docs/cli.md](docs/cli.md). Open http://127.0.0.1:3055

Host needs Docker only — no host Node for the app. Optional host `cloudflared` (install + `cloudflared login`). Set `public_url` in `$BROS_DIR/data/config/bros.yml` to start a named tunnel for that hostname.

## Data directory

When running `bros` with `BROS_DIR` unset, `BROS_DIR` is the real directory of the `bros` script (symlink-aware: `~/.local/bin/bros` → `$BROS_DIR/bros`). `BROS_HOME` is an alias. Persistent binds live under `$BROS_DIR/data` (`BROS_HOST_DATA_DIR`, mounted at `/app/data`):

- `$BROS_HOST_DATA_DIR` → container `/app/data` (SQLite, config, secrets)
- `$BROS_HOST_DATA_DIR/home` → Desktop `$HOME` (`/home/bros`). A sidecar mounts only the home paths its pack lists
- `$BROS_HOST_DATA_DIR/home/workspace` → `$HOME/workspace` on Desktop. `bros.yml` `workspace` or `BROS_HOST_WORKSPACE` replaces the host path. A sidecar gets that directory only when its pack lists `workspace`
- `$BROS_HOST_DATA_DIR/home/.local/sidecar-bins` → Desktop `$PATH` (sidecar CLI wrappers)
- `$BROS_HOST_DATA_DIR/home/.ollama` → Ollama `$HOME/.ollama` (downloaded models)
- `$BROS_HOST_DATA_DIR/sidecars/ollama/bros-model` → Ollama `/bros-model` (packaged specialist, read-only)
- `$BROS_HOST_DATA_DIR/home/.config/Cursor` and `home/.cursor` → Cursor app. `home/.config/cursor` and `home/.local/share/cursor-agent` → Agent app. Desktop mounts all of `home`
- `$BROS_HOST_DATA_DIR/home/.config/opencode`, `home/.local/share/opencode`, `home/.local/state/opencode` → OpenCode `$HOME`
- `$BROS_HOST_DATA_DIR/home/.pi` → Pi `$HOME/.pi`
- `$BROS_HOST_DATA_DIR/home/.cache/huggingface` → OpenJEV. Whisper mounts `hub` inside that tree
- `$BROS_HOST_DATA_DIR/sidecars/openwebui/data` → Open WebUI data
- `$BROS_HOST_DATA_DIR/sidecars/firecrawl/{postgres,redis,rabbitmq}` → Firecrawl service data

In-container data is `/app/data` (`BROS_DIR=/app`). Do not commit `data/`, `.nuxt`, or `node_modules`.

## Providers

On **Providers**: **Ollama** (sidecar + host, cards load collapsed; Chat on by default), **Popular services** (twelve OpenAI-compat clouds — paste a key; Chat off until the key probes healthy), then **Custom providers**. Each card has a Chat switch that only hides that provider from the Chat picker. Each installed Ollama model has its own Chat switch plus a confirm-before-delete ban icon. Popular catalog rows have the same per-model Chat switch and no delete. Details: [docs/providers.md](docs/providers.md).

**Settings** Chat fields edit the `rules` and `personality` skills. They apply on Chat turns only — never on internal `bros` titles. Details: [docs/settings.md](docs/settings.md), [docs/chat.md](docs/chat.md).

Pull on an Ollama card, or type any valid Ollama name. Progress stays on that provider’s model list (survives leaving the page). **Yours** keeps names you add. Recommended tags are **≤ 16 GB**. Sidecar DNS is `http://ollama:11434` (host publish **11435**; Compose-app Chat uses DNS, not the publish port). Sidecar compose sets `OLLAMA_NOPRUNE=1`; run host Ollama with the same env so incomplete pulls are not pruned. Host Ollama is a separate Chat/Providers row, **off by default** (Settings → Enable host Ollama). Host pull/chat use the host Ollama disk.

### Internal specialist (`bros`)

Bros ships a small internal Ollama model named `bros` for app jobs (auto-titling chats). It is **not** listed in Chat or Providers. Source: [jasenmichael/bros-model](https://github.com/jasenmichael/bros-model). Packaged GGUF installs into the Ollama sidecar on first start. See [docs/sidecars/ollama.md](docs/sidecars/ollama.md).

## Development

Contributor hot-reload: `BROS_DEV=1 ./bros`. First start builds `bros:dev`. Ctrl+C stops the full stack. After Dockerfile/compose changes: `BROS_DEV=1 ./bros update`. Tests: `pnpm --dir src test`. Full notes: [docs/development.md](docs/development.md). Docs site: [docs/website.md](docs/website.md) (`pnpm --dir src docs:dev` → http://127.0.0.1:3056/bros/). The pnpm workspace root is `src/`.

## Workspace (pnpm)

| Path | Package | Role |
|------|---------|------|
| `src/cli/` | `@bros/cli` | Host command. `bros` only starts the container. |
| `src/ui/` | `@bros/ui` | Bros UI + Nitro API; extends theme + docs; **`/` = dashboard** |
| `src/layers/docs/` | `@bros/docs` | Docs layer — content from `docs/`, `/docs` routes; extends theme |
| `src/layers/theme/` | `@bros/theme` | Nuxt UI, layouts, nav chrome, markdown/prose |
| `src/website/` | `@bros/website` | Static site homepage + `extends`; `pnpm --dir src docs:generate` → GitHub Pages `/bros/` |
| `lib/sidecars/` | — | Shipped sidecar packages (core Ollama and Whisper, plus addons). An addon can later move to core. |
| `lib/sidecars/custom/` | — | User sidecar packs. Only `README.md` is tracked. A custom pack can later move to addon or core. |

```text
theme  →  docs  →  @bros/ui     (`/` = dashboard)
                →  @bros/website (`/` = marketing)
```

See [SPEC.md](./SPEC.md), [STACK.md](./STACK.md), [PLAN.md](./PLAN.md), [DESIGN.md](./DESIGN.md).
