---
title: Cursor
description: Addon desktop app. Off until enabled. CLI and window.
---

# Cursor

Addon app `lib/apps/addon/cursor/config.yml`. Off until Enable on `/settings/apps`. `kind: deb`. Spec is the Linux x64 latest URL (`https://api2.cursor.sh/updates/download/golden/linux-x64-deb/cursor/latest`). The build downloads that file and `apt-get install`s it. Check follows redirects because a path segment is `latest`, and compares the resolved URL to the one saved at install.

`bin` is `cursor`.

Interfaces:

- `cli` — `cursor`
- `gui` — `cursor --no-sandbox`

Desktop `cursor` is `/usr/local/bin/cursor`. A window runs `/usr/share/cursor/cursor --no-sandbox` with `HOME=/home/bros`. Help and the `agent` and `tunnel` subcommands stay on `/usr/bin/cursor`. The `gui` row shows in the Apps drawer only while Cursor is enabled. The `cli` row shows under **Apps** on `/terminal` on that same rule.

Hub: [Apps](/docs/apps).
