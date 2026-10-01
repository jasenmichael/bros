---
title: Settings
description: Personality and rules skills, YAML toggles, read-only paths, and the passkey file.
---

# Settings

`/settings` shows the personality and rules skills, MCP servers, the proxy key, the host Ollama toggle, bootstrap paths (read-only), and the login passkey.

## Chat

Two fields read and write user skills. Save stores the body in `$BROS_HOME/data/skills/<id>/SKILL.md`. Chat loads those bodies on each user turn. They never apply to internal `bros` titles:

- **Prepend to every message** — `rules` skill
- **Assistant description** — `personality` skill

Empty means that skill adds no text. They apply to Chat turns only — never to internal specialist `bros` (`Label:`).

## MCP

Add an HTTP server id and URL. Bros stores the list. Chat does not call these servers.

Chat and passkey fields are full width in the `max-w-xl` column.

## Host Ollama

**Enable host Ollama** (off by default) stores `enable_host_ollama` in `$BROS_DIR/bros.yml`. On shows the host daemon as a Chat/Providers row (`ollama-host`). Bros never starts that daemon. Off omits the row and 404s `/api/providers/ollama-host/*`. Scan and port override live on the Providers host card, not Sidecars.

**Enable Whisper** stores `enable_whisper` in the same file (off by default).

Those two toggles are the Settings module (`src/server/utils/settings`). Bootstrap paths stay in [Configuration](/docs/configuration).

## Paths

- `BROS_DIR` — app directory (container `/app`)
- `BROS_DATA_DIR` — `$BROS_DIR/data` (container `/app/data`)
- passkey file — `{dataDir}/passkey`
- proxy key — `{dataDir}/proxy-key` (Bearer token for tunneled `api` and `openai` paths; rotate on this page)
- session secret — `{dataDir}/session-secret`

Host layout and YAML load order: [Configuration](/docs/configuration). Env catalog: [Environment](/docs/environment).

## Passkey

Source of truth is plaintext `{dataDir}/passkey`. On startup Bros creates the file if missing and prints the key to logs (`[bros] passkey: …`). Settings updates that file.

Session cookie `bros_session` (HttpOnly, SameSite=Lax, Path=/; host-only; Secure on HTTPS including the Cloudflare tunnel, not on local HTTP).

Log out from this page.
