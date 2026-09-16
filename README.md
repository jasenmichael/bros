# Bros

**B**oxed **R**untime **O**rchestration **S**ystem — local AI control plane: chat, models, and Docker-managed sidecars.

## Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Clones [jasenmichael/bros](https://github.com/jasenmichael/bros) into `~/.bros` (override with `BROS_DIR`). Docs: https://jasenmichael.github.io/bros/

## Quick start

```bash
./bros --dev          # foreground, hot reload
./bros -D             # production daemon
./bros stop           # stop core + sidecars (add --dev if you started with --dev)
./bros status
```

Default action (no command) is **start**. Open http://127.0.0.1:3055

Host needs Docker only — no host Node for the app.

## Data directory

`BROS_DIR` is the checkout when `./bros` sits next to `docker-compose.yml` + `sidecars/`. The installed binary uses `~/.bros`. Override with `BROS_DIR`. Persistent binds live under `$BROS_DIR/data` (`BROS_HOST_DATA_DIR`):

- `$BROS_HOST_DATA_DIR` → app `/data` (SQLite, custom sidecars, logs)
- `$BROS_HOST_DATA_DIR/ollama` → Ollama `/root/.ollama`
- `$BROS_HOST_DATA_DIR/openwebui` → Open WebUI data
- `$BROS_HOST_DATA_DIR/opencode` → OpenCode workspace

In-container `BROS_DATA_DIR` stays `/data`. Do not commit `data/`, `.env`, `.nuxt`, or `node_modules`.

## Models

On **Models**, pull from the menu or type any valid Ollama name (`name:tag` or community `owner/name:tag`):

1. **Yours** — names you added; persisted in the Ollama provider `config.customModels`
2. **Recommended** — official (and verified community) tags whose on-disk size is **≤ 16 GB**
3. **Ollama** — registry names
4. **Hugging Face** — GGUF via `hf.co/user/repo`

`qwen3-coder:14b` is not a library tag (official coder is `:30b` / `:480b`). Use `freehuntx/qwen3-coder:14b` or `qwen2.5-coder:14b`. 30B tags (~19 GB) stay in the Ollama list, not Recommended.

## Docs site

Static site is `@bros/website` (`src/website`), `baseURL` `/bros/`:

```bash
pnpm docs:dev
# http://127.0.0.1:3056/bros/

pnpm docs:generate
pnpm --filter @bros/website preview
```

## Workspace (pnpm)

| Path | Package | Role |
|------|---------|------|
| `src/app/` | `@bros/app` | Bros UI + Nitro API; extends docs layer; **`/` = dashboard** |
| `src/layers/docs/` | `@bros/docs` | Docs layer — content from `docs/`, `/docs` routes |
| `src/layers/theme/` | `@bros/theme` | Nuxt UI + Content + shared nav/theme |
| `src/website/` | `@bros/website` | Static site (`pnpm docs:generate`) → GitHub Pages `/bros/` |
| `sidecars/` | — | Core sidecar packages |

```text
@bros/theme → @bros/docs → @bros/app (dashboard at /)
                        ↘ @bros/website
```

See [SPEC.md](./SPEC.md), [STACK.md](./STACK.md), [PLAN.md](./PLAN.md), [DESIGN.md](./DESIGN.md).
