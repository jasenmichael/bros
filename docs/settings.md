---
title: Settings
description: Chat extras, host Ollama toggle, read-only bootstrap paths, and the passkey file.
---

# Settings

`/settings` shows Chat extras, the host Ollama toggle, bootstrap paths (read-only), and the login passkey.

## Chat

Two fields persist in SQLite `meta` (same `bros.sqlite` as other UI settings), not YAML or env:

- `chat_prepend` — extra context prepended to the last user text on each send
- `chat_assistant_description` — short personality/role used as the system message

Empty means off. Save writes both. They apply to user Chat only — never to internal specialist `bros` (`Label:` titles). Message shape: [Chat](/docs/chat).

Chat and passkey fields are full width in the `max-w-xl` column.

## Host Ollama

**Enable host Ollama** (off by default) stores `enable_host_ollama` in SQLite `meta`. On shows the host daemon as a Chat/Providers row (`ollama-host`). Bros never starts that daemon. Off omits the row and 404s `/api/providers/ollama-host/*`. Scan and port override live on the Providers host card, not Sidecars.

## Paths

- `working_dir` — in-container app root (`/app`)
- `data_dir` — in-container data (`/data`, host `$BROS_HOME/data`)
- passkey file — `{dataDir}/passkey`

Host layout and YAML load order: [Configuration](/docs/configuration). Env catalog: [Environment](/docs/environment).

## Passkey

Source of truth is plaintext `{dataDir}/passkey`. On startup Bros creates the file if missing and prints the key to logs (`[bros] passkey: …`). Settings updates that file.

Session cookie `bros_session` (HttpOnly, SameSite=Lax, Path=/; host-only; Secure on HTTPS including the Cloudflare tunnel, not on local HTTP).

Log out from this page.
