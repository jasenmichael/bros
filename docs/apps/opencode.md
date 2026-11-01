---
title: OpenCode
description: Addon npm app. Off until enabled. Web UI on port 4096.
---

# OpenCode

Addon app `lib/apps/addon/opencode/config.yml`. Off until Enable on `/apps`. `kind: npm`. Spec `@opencode/cli`. `bin` is `opencode`.

Interfaces:

- `cli` — `opencode`. Shows under **Apps** on `/terminal` only while OpenCode is enabled.
- `webui` — container port **4096**, publish **4096**. Open is `http://127.0.0.1:4096/` on `/apps` only while enabled, Forward to host is on, and the service is running.

Ensure installs `@opencode/cli` with npm into `/home/bros/.local` once `node`, `npm`, and `npx` exist. Start runs `opencode serve --hostname 0.0.0.0 --port 4096` in `/home/bros`. The server password is printed into the service log (`data/var/logs/apps/opencode.log`); open **Logs** on that Apps row after Start. Start, then Open. Stop keeps it stopped across a Desktop restart. Paperclip runs this Desktop binary.

Hub: [Apps](/docs/apps.md).
