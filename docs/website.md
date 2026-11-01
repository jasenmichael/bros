---
title: Docs site
description: @bros/website on GitHub Pages, same docs/ as the app.
---

# Docs site

Package `@bros/website`. `baseURL` `/bros/`. Same repo-root `docs/` as the app `/docs`. Layer chain: theme → docs → website (marketing `/`) or app (dashboard `/`). GitHub Pages is the only build: the app image and dev container do not copy, install, or cache this package. `scripts/install.sh` is copied into `public/install.sh` on `docs:dev` / `docs:generate` (Pages URL `/bros/install.sh`).

## Local

```bash
pnpm --dir app docs:dev
# http://127.0.0.1:3056/bros/
```

```bash
pnpm --dir app docs:generate
pnpm --dir app --filter @bros/website preview
```

GitHub Pages: https://jasenmichael.github.io/bros/

`docs/adr/` is gitignored local notes, not a docs page. New markdown goes in `docs/` and must be added to `DOCS_NAV_TREE` in `app/layers/docs/app/utils/docsNav.ts` so the dock, website nav, docs index, and breadcrumbs all list it. Do not put pages under `app/ui`. Theme owns `layouts/default.vue` and `ProsePre`. Docs render through the docs-layer `ContentRenderer` + `.bros-prose`. Docs pages show breadcrumbs above the title.

Website nav: Home, then the docs directory tree (Start, App, Docker apps, Apps, Popular services, Contribute). Marketing `/` matches the repo README pitch. Install and Development are first-class CTAs on that home; detail lives in [Install](/docs/install.md) and [Development](/docs/development.md).

## Markdown links

Write in-repo docs links as `/docs/<page>.md` (keep `#hash` after `.md`). That makes GitHub blob URLs resolve. The docs-layer `ProseA` strips `.md` at render so Nuxt Content routes stay extensionless.
