---
title: OpenCode
description: Addon npm app. Off until enabled. CLI only.
---

# OpenCode

Addon app `lib/apps/addon/opencode/config.yml`. Off until Enable on `/settings/apps`. `kind: npm`. Spec `@opencode/cli`. `bin` is `opencode`.

Interface:

- `cli` — `opencode`. Shows under **Apps** on `/terminal` only while OpenCode is enabled.

The image build runs `npm install -g --prefix /usr/local @opencode/cli`. There is no `webui` and no service. The OpenCode sidecar pack stays in the tree. Paperclip runs this Desktop binary.

Hub: [Apps](/docs/apps).
