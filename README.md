# Bros

**B**oxed **R**untime **O**rchestration **S**ystem — local AI control plane: chat, models, and Docker-managed sidecars.

## Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Clones [jasenmichael/bros](https://github.com/jasenmichael/bros) into `~/.bros`. Docs: https://jasenmichael.github.io/bros/

## Quick start

```bash
./bros --dev          # foreground, hot reload
./bros -D             # production daemon
./bros stop           # stop core + sidecars (add --dev if you started with --dev)
./bros status
```

Default action (no command) is **start**. Open http://localhost:3055

Host needs Docker only — no host Node for the app.

## Workspace (pnpm)

| Path | Package | Role |
|------|---------|------|
| `app/` | `@bros/app` | Bros UI + Nitro API; extends docs layer; **`/` = dashboard** |
| `layers/docs/` | `@bros/docs` | Docs layer — content from `docs/`, `/docs` routes |
| `layers/theme/` | `@bros/theme` | Nuxt UI + Content + shared nav/theme |
| `website/` | `@bros/website` | Static site (`pnpm docs:generate`) → GitHub Pages `/bros/` |
| `sidecars/` | — | Core sidecar packages |

```text
@bros/theme → @bros/docs → @bros/app (dashboard at /)
                        ↘ @bros/website
```

See [SPEC.md](./SPEC.md), [STACK.md](./STACK.md), [PLAN.md](./PLAN.md), [DESIGN.md](./DESIGN.md).
