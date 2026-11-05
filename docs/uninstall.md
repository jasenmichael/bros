---
title: Uninstall
description: Remove a Bros release install, or delete a source checkout.
---

# Uninstall

## Release

`bros uninstall` is for a release install. It stops the stack, removes `~/.local/bin/bros`, the shipped files, and the systemd user unit. It keeps `data/`, `.env`, and `bros.yml`.

```bash
bros uninstall
```

Same command: `~/.bros/uninstall.sh`.

Wipe the install directory, including data:

```bash
bros uninstall --purge
```

Install again: [Install](/docs/install.md).

Remove only the service and leave Bros installed:

```bash
bros service uninstall
```

## Source

A source checkout is refused by `bros uninstall`. Stop the service first when the unit exists, then remove the clone and the symlink.

```bash
bros service uninstall
rm -rf ~/.bros
rm -f ~/.local/bin/bros
```

If `BROS_DIR` or `BROS_BIN` was set at install, remove those paths instead.
