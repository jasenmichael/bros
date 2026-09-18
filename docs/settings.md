---
title: Settings
description: Read-only bootstrap paths and the passkey file.
---

# Settings

`/settings` shows bootstrap paths (read-only) and the login passkey.

## Paths

- `working_dir` — in-container app root (`/app`)
- `data_dir` — in-container data (`/data`, host `$BROS_HOME/data`)
- passkey file — `{dataDir}/passkey`

Host layout and YAML load order: [Configuration](/docs/configuration). Env catalog: [Environment](/docs/environment).

## Passkey

Source of truth is plaintext `{dataDir}/passkey`. On startup Bros creates the file if missing and prints the key to logs (`[bros] passkey: …`). Settings updates that file.

Session cookie `bros_session` (HttpOnly, SameSite=Lax, Path=/; host-only; Secure on HTTPS including the Cloudflare tunnel, not on local HTTP).

Log out from this page.
