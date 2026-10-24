---
title: Agent
description: Cursor agent CLI. Off until enabled. kind run.
---

# Agent

Addon app `lib/apps/addon/agent/config.yml`. Off until Enable on `/settings/desktop`. `kind: run`. The install command is `curl https://cursor.com/install -fsS | bash`.

`bin` is `agent`. Also exposes `cursor-agent`. The `cli` interface is `agent, cursor-agent`. That row shows under **Apps** on `/terminal` only while Agent is enabled. There is no window.

`kind: run` has no Check. Update writes a force stamp and rebuilds Desktop so that curl runs again.

Hub: [Apps](/docs/apps).
