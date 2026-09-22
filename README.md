# Bros

**B**oxed **R**untime **O**rchestration **S**ystem — local AI control plane: chat, providers, and Docker-managed sidecars.

## Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Optional systemd user service:

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
```

Clones [jasenmichael/bros](https://github.com/jasenmichael/bros) into `~/.bros` (`BROS_HOME`; `BROS_DIR` is an alias). Writes `~/.config/bros.yml` if missing. Symlinks `~/.local/bin/bros`. Docs: https://jasenmichael.github.io/bros/

## Quick start

```bash
bros                 # foreground start (production compose)
bros -D              # production daemon
bros stop            # stop core + sidecars
bros status
bros update          # git pull + submodule + images + rebuild
bros service install # systemd --user (Linux)
```

Default action (no command) is **start**. Open http://127.0.0.1:3055

Host needs Docker only — no host Node for the app. Optional host `cloudflared` (install + `cloudflared login`). Set `public_url` in `~/.config/bros.yml` to start a named tunnel for that hostname.

## Data directory

`BROS_HOME` is the checkout when the CLI sits next to `docker-compose.yml` + `sidecars/`. The installed clone is `~/.bros`. Override with `BROS_HOME` or `BROS_DIR`. Persistent binds live under `$BROS_HOME/data` (`BROS_HOST_DATA_DIR`):

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, additional sidecars, sidecar-repos, logs)
- `$BROS_HOST_DATA_DIR/ollama` → Ollama sidecar `/root/.ollama`
- `$BROS_HOST_DATA_DIR/bros-model` → Ollama sidecar `/bros-model` (packaged specialist, read-only)
- `$BROS_HOST_DATA_DIR/openwebui` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode` → OpenCode workspace
- `$BROS_HOST_DATA_DIR/firecrawl-pg` → Firecrawl Postgres

In-container `BROS_DATA_DIR` stays `/data`. Do not commit `data/`, `.env`, `.nuxt`, or `node_modules`.

## Providers

On **Providers**: **Ollama** (sidecar + host, cards load collapsed; Chat on by default), **Popular services** (twelve OpenAI-compat clouds — paste a key; Chat off until the key probes healthy), then **Custom providers**. Each card has a Chat switch that only hides that provider from the Chat picker. Each installed Ollama model has its own Chat switch plus a confirm-before-delete ban icon. Popular catalog rows have the same per-model Chat switch and no delete. Details: [docs/providers.md](docs/providers.md).

**Settings** Chat fields (prepend + assistant description) persist in SQLite `meta`, not YAML or env. They apply on user Chat sends only — never on internal `bros` titles. Details: [docs/settings.md](docs/settings.md), [docs/chat.md](docs/chat.md).

Pull on an Ollama card, or type any valid Ollama name. Progress stays on that provider’s model list (survives leaving the page). **Yours** keeps names you add. Recommended tags are **≤ 16 GB**. Sidecar DNS is `http://ollama:11434` (host publish **11435**). Sidecar compose sets `OLLAMA_NOPRUNE=1`; run host Ollama with the same env so incomplete pulls are not pruned. Host Ollama is a separate Chat/Providers row, **off by default** (Settings → Enable host Ollama). Host pull/chat use the host Ollama disk.

### Internal specialist (`bros`)

Bros ships a small internal Ollama model named `bros` for app jobs (auto-titling chats). It is **not** listed in Chat or Providers. Source: [jasenmichael/bros-model](https://github.com/jasenmichael/bros-model). Packaged GGUF installs into the Ollama sidecar on first start. See [docs/sidecars/ollama.md](docs/sidecars/ollama.md).

## Development

Contributor hot-reload: `pnpm dev` (`BROS_DEV=1`). First start builds `bros:dev`. Ctrl+C stops the full stack. After Dockerfile/compose changes: `pnpm dev:update`. Tests: `pnpm test`. Full notes: [docs/development.md](docs/development.md). Docs site: [docs/website.md](docs/website.md) (`pnpm docs:dev` → http://127.0.0.1:3056/bros/).

## Workspace (pnpm)

| Path | Package | Role |
|------|---------|------|
| `src/app/` | `@bros/app` | Bros UI + Nitro API; extends theme + docs; **`/` = dashboard** |
| `src/layers/docs/` | `@bros/docs` | Docs layer — content from `docs/`, `/docs` routes; extends theme |
| `src/layers/theme/` | `@bros/theme` | Nuxt UI, layouts, nav chrome, markdown/prose |
| `src/website/` | `@bros/website` | Static site homepage + `extends`; `pnpm docs:generate` → GitHub Pages `/bros/` |
| `sidecars/` | — | Shipped sidecar packages (core Ollama + addons) |

```text
theme  →  docs  →  @bros/app     (`/` = dashboard)
                →  @bros/website (`/` = marketing)
```

See [SPEC.md](./SPEC.md), [STACK.md](./STACK.md), [PLAN.md](./PLAN.md), [DESIGN.md](./DESIGN.md).
