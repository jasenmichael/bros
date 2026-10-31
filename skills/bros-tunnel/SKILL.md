---
name: bros-tunnel
description: >-
  Configure Bros host Cloudflare tunnel, proxy.public webuis, and strip-prefix
  API/openai proxies with proxy-key. Use when exposing Bros remotely or setting
  Cursor Override Base URL through the tunnel.
---

# Tunnel and proxies

Docs: `$BROS_DIR/docs/tunnel.md` first, else GitHub `docs/tunnel.md`. Status: `/status` and `/api/tunnel*`.

## Host tunnel

Optional host `cloudflared` (`cloudflared login`). Set `public_url` in `$BROS_DIR/data/config/bros.yml` for a named tunnel to that hostname.

Do **not** add extra Cloudflare hostnames per docker UI.

## Path proxies

| Interface | Behavior |
|-----------|----------|
| `webui` + `proxy.public: true` | Same-host `/${id}/` only when the UI natively listens under that prefix |
| `api` / `openai` | Always proxied: `/<id><basePath>` strips `/<id>` (openai default `/v1`) |

LAN Open/Pin stay `http://127.0.0.1:<publish>/`. Stopped public id → 404.

## Auth over tunnel

Browser: passkey → `bros_session` (same as local). Machine / Cursor Override Base URL: `Authorization: Bearer <proxy-key>` from `$BROS_DATA_DIR/proxy-key`.

```bash
# Example: OpenAI-compatible via tunnel + proxy-key
# Base URL: https://<public_host>/ollama/v1
# Header: Authorization: Bearer <proxy-key>
```

Full route index: `bros-api`. Docker pack `proxy.public` authoring: `bros-create-app`.
