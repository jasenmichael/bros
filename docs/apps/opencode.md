---
title: OpenCode
description: Addon npm app. Off until enabled. Web UI on port 4097.
---

# OpenCode

Addon app `lib/apps/addon/opencode/config.yml`. Off until Enable on `/settings/desktop`. `kind: npm`. Spec `@opencode/cli`. `bin` is `opencode`.

Interfaces:

- `cli` — `opencode`. Shows under **Apps** on `/terminal` only while OpenCode is enabled.
- `webui` — container port **4096**, publish **4097**. Open is `http://127.0.0.1:4097/` only while enabled.

Ensure installs `@opencode/cli` with npm into `/home/bros/.local` once `node`, `npm`, and `npx` exist. Start runs `opencode serve --hostname 0.0.0.0 --port 4096`. The server password is on that Apps row after Start. Stop keeps it stopped across a Desktop restart. The service log stays at `data/var/logs/apps/opencode.log`. The OpenCode sidecar also publishes **4097**. Leave that sidecar stopped while this app publishes the port. Paperclip runs this Desktop binary.

Hub: [Apps](/docs/apps).
