# Bros progress

## Current: M0–M6 on `main` (no M7)

Product brand is **Bros**. Sidecars remain sidecars (routes, APIs, `sidecar.yml`, `sidecars/`). Host `cloudflared` tunnel, passkey sessions, and no path proxy landed on `main` (`d4bf952`). Remaining gaps are unplanned follow-ups in [PLAN.md](./PLAN.md), not a numbered milestone.

Docs markdown in **`docs/`**. App extends `@bros/docs` and **overrides `/` with the dashboard**. Static site: `src/website` (`pnpm docs:generate`) → https://jasenmichael.github.io/bros/

### Run (dev)

```bash
./bros --dev
```

Open http://127.0.0.1:3055
Health: http://127.0.0.1:3055/api/health

### Install

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Clones into `~/.bros` unless `BROS_DIR` is set. Host data is `$BROS_DIR/data`.

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
| Host tunnel + auth + no path proxy | done (`main`) |
| M7 | skipped — follow-ups only |
