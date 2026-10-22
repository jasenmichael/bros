---
title: Paperclip
description: Addon npm app. Off until enabled. Web UI on port 3100.
---

# Paperclip

Addon app `lib/apps/addon/paperclip/config.yml`. Off until Enable on `/settings/apps`. `kind: npm`. Spec `paperclipai`. `bin` is `paperclipai`. Home is `.paperclip`.

Interfaces:

- `cli` — `paperclipai`. Shows under **Apps** on `/terminal` only while Paperclip is enabled.
- `webui` — container port **3100**, publish **3100**. Open is `http://127.0.0.1:3100/` only while enabled.

Service command is `paperclipai run`. Enable installs the app and does not start the service. Start and Stop are on the Apps row. Stop keeps it stopped across a Desktop restart.

Hub: [Apps](/docs/apps).
