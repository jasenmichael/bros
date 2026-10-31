---
title: Docs site
description: @bros/website on GitHub Pages, same docs/ as the app.
---

# Docs site

Package `@bros/website`. `baseURL` `/bros/`. Same repo-root `docs/` as the app `/docs`. Layer chain: theme → docs → website (marketing `/`) or app (dashboard `/`). GitHub Pages is the only build: the app image and dev container do not copy, install, or cache this package.

## Local

```bash
pnpm --dir src docs:dev
# http://127.0.0.1:3056/bros/
```

```bash
pnpm --dir src docs:generate
pnpm --dir src --filter @bros/website preview
```

GitHub Pages: https://jasenmichael.github.io/bros/

`docs/adr/` is gitignored local notes, not a docs page. New markdown goes in `docs/` and must be added to `DOCS_NAV_TREE` in `src/layers/docs/app/utils/docsNav.ts` so the dock, website nav, docs index, and breadcrumbs all list it. Do not put pages under `src/ui`. Theme owns `layouts/default.vue` and `ProsePre`. Docs render through the docs-layer `ContentRenderer` + `.bros-prose`. Docs pages show breadcrumbs above the title.

Website nav: Home, then the docs directory tree (Start, App, Docker apps, Apps, Popular services, Contribute). Marketing `/` matches the repo README pitch. Install and Development are first-class CTAs on that home; detail lives in [Install](/docs/install) and [Development](/docs/development).
