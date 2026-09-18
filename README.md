# Bros

**B**oxed **R**untime **O**rchestration **S**ystem — local AI control plane: chat, models, and Docker-managed sidecars.

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

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, custom sidecars, logs)
- `$BROS_HOST_DATA_DIR/ollama` → Ollama sidecar `/root/.ollama`
- `$BROS_HOST_DATA_DIR/bros-model` → Ollama sidecar `/bros-model` (packaged specialist, read-only)
- `$BROS_HOST_DATA_DIR/openwebui` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode` → OpenCode workspace

In-container `BROS_DATA_DIR` stays `/data`. Do not commit `data/`, `.env`, `.nuxt`, or `node_modules`.

## Models

On **Models**: **Ollama** (sidecar + host), **Popular services** (twelve OpenAI-compat clouds — paste a key), then **Custom providers**. Details: [docs/models.md](docs/models.md), [docs/providers.md](docs/providers.md).

Pull on an Ollama card, or type any valid Ollama name. **Yours** keeps names you add. Recommended tags are **≤ 16 GB**. Sidecar DNS is `http://ollama:11434` (host publish **11435**). Host pull/chat use the host Ollama disk.

### Internal specialist (`bros`)

Bros ships a small internal Ollama model named `bros` for app jobs (auto-titling chats). It is **not** listed in Chat or Models. Source: [jasenmichael/bros-model](https://github.com/jasenmichael/bros-model). Packaged GGUF installs into the Ollama sidecar on first start. See [docs/sidecars/ollama.md](docs/sidecars/ollama.md).

## Development

Contributor hot-reload: `pnpm dev` (`BROS_DEV=1`). First start builds `bros:dev`. Ctrl+C stops the full stack. After Dockerfile/compose changes: `pnpm dev:update`. Tests: `pnpm test`. Full notes: [docs/development.md](docs/development.md). Docs site: [docs/website.md](docs/website.md) (`pnpm docs:dev` → http://127.0.0.1:3056/bros/).

## Workspace (pnpm)

| Path | Package | Role |
|------|---------|------|
| `src/app/` | `@bros/app` | Bros UI + Nitro API; extends theme + docs; **`/` = dashboard** |
| `src/layers/docs/` | `@bros/docs` | Docs layer — content from `docs/`, `/docs` routes; extends theme |
| `src/layers/theme/` | `@bros/theme` | Nuxt UI, layouts, nav chrome, markdown/prose |
| `src/website/` | `@bros/website` | Static site homepage + `extends`; `pnpm docs:generate` → GitHub Pages `/bros/` |
| `sidecars/` | — | Core sidecar packages |

```text
theme  →  docs  →  @bros/app     (`/` = dashboard)
                →  @bros/website (`/` = marketing)
```

See [SPEC.md](./SPEC.md), [STACK.md](./STACK.md), [PLAN.md](./PLAN.md), [DESIGN.md](./DESIGN.md).
