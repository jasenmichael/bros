---
title: Firecrawl sidecar
description: Self-hosted Firecrawl scrape API on host port 3002.
---

# Firecrawl sidecar

Shipped **addon** package `sidecars/addon/firecrawl`. Self-hosted [Firecrawl](https://docs.firecrawl.dev/contributing/self-host) scrape/crawl API (contract **v2.11.162**). Enabled by default. Disable autostart with `BROS_SIDECAR_FIRECRAWL=0` or `BROS_SIDECARS_DISABLE=firecrawl`. Still listed under Addon sidecars with source **bros**.

There is **no** Firecrawl Cloud Web UI on this pack. Open is `http://127.0.0.1:3002/` (HTTP API). There is no Pin in nav on this card. Copy also offers `/v2` and the Docker DNS URLs `http://firecrawl:3002/` and `http://firecrawl:3002/v2` (Bros network). The shipped [Firecrawl UI](/docs/sidecars/firecrawl-ui) addon is a separate browser UI (publish **3081**); pin that pack, and point its API URL at this sidecar.

Auth is off (`USE_DB_AUTHENTICATION=false`). Trusted network only — do not expose this baseline to the public internet. `ALLOW_LOCAL_WEBHOOKS` and `TEST_SUITE_SELF_HOSTED` are on so scrape/webhook of localhost and RFC1918 is allowed. From the API container, host apps are `http://host.docker.internal:<port>/` (not `http://127.0.0.1:<port>/`).

## Ports

- API container: **3002**
- Host publish: **3002** (`BROS_FIRECRAWL_PORT` override)
- Playwright **3000** stays internal. Bros never publishes host **3000** or **8080**.

On the `bros` Docker network, other containers use `http://firecrawl:3002`.

## Stack

Compose uses GHCR images (`ghcr.io/firecrawl/firecrawl:2.11.162`, playwright-service + nuq-postgres `:latest`), Redis, and RabbitMQ. PostgreSQL queue. No FoundationDB. No queue-admin UI. No Fire-engine.

RAM: upstream limits on the API (8G) and Playwright (4G). Give Docker several GB.

`OLLAMA_BASE_URL=http://ollama:11434` so LLM extract can use sidecar Ollama. Core scrape/markdown does not need an LLM.

Open-source self-host does **not** include Fire-engine, screenshots, page actions, or Cloud-only agent/browser features. Details: [self-host guide](https://docs.firecrawl.dev/contributing/self-host).

## Verify

After the stack is up:

```bash
curl --fail --silent --show-error --max-time 5 \
  http://127.0.0.1:3002/v0/health/readiness
```

Expect `{"status":"ok"}`. Then one scrape:

```bash
curl --fail-with-body --silent --show-error --max-time 75 \
  -X POST http://127.0.0.1:3002/v2/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","formats":["markdown"],"timeout":60000}'
```

A success body has `"success": true` and `data.markdown`.

## Binds

- `$BROS_HOST_DATA_DIR/firecrawl/var/lib/postgresql/data` → Postgres
- `$BROS_HOST_DATA_DIR/firecrawl/data` → Redis `/data`
- `$BROS_HOST_DATA_DIR/firecrawl/var/lib/rabbitmq` → RabbitMQ `/var/lib/rabbitmq`

Postgres password: `BROS_FIRECRAWL_POSTGRES_PASSWORD` (default is a long local-only string). The database is not published to the host.

Hub: [Sidecars](/docs/sidecars).
