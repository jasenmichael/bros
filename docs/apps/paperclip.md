---
title: Paperclip
description: Addon npm app. Off until enabled. Web UI on port 3100.
---

# Paperclip

Addon app `lib/apps/addon/paperclip/config.yml`. Off until Enable on `/apps`. `kind: npm`. Spec `paperclipai`. `bin` is `paperclipai`.

Interfaces:

- `cli` — `paperclipai`. Shows under **Apps** on `/terminal` only while Paperclip is enabled.
- `webui` — container port **3100**, publish **3100**. Open is `http://127.0.0.1:3100/` on `/apps` only while enabled, Forward to host is on, and the service is running.

Ensure installs `paperclipai` with npm into `/home/bros/.local`. Start runs `paperclipai run` in `/home/bros`, so `~/workspace` is `/home/bros/workspace`. Host publish for **3100** is written into `config/apps-compose.yml` under Compose service **`bros`** (same path as every other package webui). Stop, run onboard in the Terminal, then Start, then Open. The first visit claims the instance. An offline page titled **Paperclip is offline** is Paperclip’s own service-worker fallback — not a Bros wrapper. It can mean the service is down, not claimed yet, host publish missing, or Paperclip auth/origin config does not match `http://127.0.0.1:3100/` (fix inside Paperclip, not Bros). Stop keeps it stopped across a Desktop restart. The log file stays.

Hub: [Apps](/docs/apps).
