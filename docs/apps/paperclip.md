---
title: Paperclip
description: Addon npm app. Off until enabled. Web UI on port 3100.
---

# Paperclip

Addon app `lib/apps/addon/paperclip/config.yml`. Off until Enable on `/settings/apps`. `kind: npm`. Spec `paperclipai`. `bin` is `paperclipai`.

Interfaces:

- `cli` — `paperclipai`. Shows under **Apps** on `/terminal` only while Paperclip is enabled.
- `webui` — container port **3100**, publish **3100**. Open is `http://127.0.0.1:3100/` only while enabled.

The image layer copies the app and does not `npm install` it. Start runs `serve.sh`: it installs the managed CLI into `/home/bros/.paperclip` when the shim is missing, runs `paperclipai onboard --yes --bind lan` once, then `paperclipai run` on `0.0.0.0:3100`. Open is `http://127.0.0.1:3100/`. The first visit claims the instance. Stop keeps it stopped across a Desktop restart.

Hub: [Apps](/docs/apps).
