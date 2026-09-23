# Bros progress

## Current: M0–M7 on `main`

Product brand is **Bros**. Sidecars remain sidecars (routes, APIs, `sidecar.yml`, `sidecars/`). Host `cloudflared` tunnel, passkey sessions, and optional `proxy.public` path proxy live in the tree. No shipped pack opts in today (OpenCode still serves `/`). **M7** is the install and runner CLI. Leftover gaps are unplanned follow-ups in [PLAN.md](./PLAN.md).

Docs markdown in **`docs/`**. Both apps extend theme + docs. `/docs` is identical. App **`/` = dashboard**; website **`/` = marketing**. Static site: `src/website` (`pnpm docs:generate`) → https://jasenmichael.github.io/bros/

### Run (dev)

```bash
pnpm dev
```

Open http://127.0.0.1:3055
Health: http://127.0.0.1:3055/api/health

### Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Clones into `~/.bros` (`BROS_HOME`) unless `BROS_HOME` / `BROS_DIR` is set. Writes `~/.config/bros.yml` if missing. Symlinks `~/.local/bin/bros`. Host data is `$BROS_HOME/data`.

### Docs site

```bash
pnpm docs:dev
# http://127.0.0.1:3056/bros/

pnpm docs:generate
pnpm --filter @bros/website preview
```

`baseURL` stays `/bros/`.

### Milestone log

| Milestone | Status |
|-----------|--------|
| M0–M6 | done |
| Rename → Bros | done |
| Host tunnel + auth + `proxy.public` path proxy | done |
| M7 | done — install + runner CLI |
