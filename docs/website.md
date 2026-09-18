---
title: Docs site
description: @bros/website on GitHub Pages, same docs/ as the app.
---

# Docs site

Package `@bros/website`. `baseURL` `/bros/`. Same repo-root `docs/` as the app `/docs`. Layer chain: theme → docs → website (marketing `/`) or app (dashboard `/`).

## Local

```bash
pnpm docs:dev
# http://127.0.0.1:3056/bros/
```

```bash
pnpm docs:generate
pnpm --filter @bros/website preview
```

GitHub Pages: https://jasenmichael.github.io/bros/

New markdown goes in `docs/` and must be added to `DOCS_NAV_TREE` in `src/layers/docs/app/utils/docsNav.ts` so the dock, website nav, docs index, and breadcrumbs all list it. Do not put pages under `src/app`. Theme owns `layouts/default.vue` and `ProsePre`. Docs render through the docs-layer `ContentRenderer` + `.bros-prose`. Docs pages show breadcrumbs above the title.

Website nav: Home, then the docs directory tree (Start, App, Sidecars, Popular services, Contribute).
