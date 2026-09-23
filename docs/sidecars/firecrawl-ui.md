---
title: Firecrawl UI sidecar
description: Firecrawl scrape UI on host port 3081.
---

# Firecrawl UI sidecar

Shipped **addon** package `sidecars/addon/firecrawl-ui`. Vue UI for the [Firecrawl](https://firecrawl.dev/) scrape API ([obeone/firecrawl-ui](https://github.com/obeone/firecrawl-ui)). Enabled by default. Disable autostart with `BROS_SIDECAR_FIRECRAWL_UI=0` or `BROS_SIDECARS_DISABLE=firecrawl-ui`. Still listed under Addon sidecars with source **bros**.

Image `obeoneorg/firecrawl-ui` is wrapped with Bros nginx: the SPA and `/v2` share host **3081**, and nginx proxies `/v2` (and `/v0`) to sidecar `firecrawl:3002`. That avoids cross-port axios `Network Error` in Cursor preview and other locked browsers. The page sets API base URL to this origin (browser `localStorage`). Point the settings URL at Firecrawl Cloud only if you want the hosted API instead.

Scrape a **public** `https://` URL, or a host app as `http://host.docker.internal:<port>/` (Firecrawl runs in Docker; `http://127.0.0.1:3055/...` is the Firecrawl container, not Bros). Bros app routes need a session cookie, so `/sidecars` scrapes as the login page unless you pass auth.

The Firecrawl sidecar must be running (`ALLOW_LOCAL_WEBHOOKS` + `TEST_SUITE_SELF_HOSTED` so localhost/private URLs validate).

## Ports

- Container: **8080**
- Host publish: **3081** (`BROS_FIRECRAWL_UI_PORT` override)

Never publish host ports **3000** or **8080**. Open/Pin: `http://127.0.0.1:3081/`.

No data bind. Config stays in the browser.

Hub: [Sidecars](/docs/sidecars).
