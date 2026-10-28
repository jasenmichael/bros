---
title: Paperclip
description: Addon npm app. Off until enabled. Web UI on port 3100.
---

# Paperclip

Addon app `lib/apps/addon/paperclip/config.yml`. Off until Enable on `/settings/desktop`. `kind: npm`. Spec `paperclipai`. `bin` is `paperclipai`.

Interfaces:

- `cli` — `paperclipai`. Shows under **Apps** on `/terminal` only while Paperclip is enabled.
- `webui` — container port **3100**, publish **3100**. Open is `http://127.0.0.1:3100/` only while enabled.

Ensure installs `paperclipai` with npm into `/home/bros/.local`. Start runs `paperclipai run` in `/home/bros`, so `~/workspace` is `/home/bros/workspace`. Open is `http://127.0.0.1:3100/` while Forward to host is on. Stop, run onboard in the terminal, then Start. The first visit claims the instance. Stop keeps it stopped across a Desktop restart. The log file stays.

Hub: [Apps](/docs/apps).
