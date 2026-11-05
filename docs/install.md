---
title: Install
description: Install from a release, from source, from a source branch, or as a service.
---

# Install

Needs Docker and Docker Compose. Files land in `~/.bros` (`BROS_DIR`). The command is `~/.local/bin/bros`.

## Release

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

## Source

Needs git and cargo. Clones branch `main` and builds the CLI.

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --from-src
```

## Source branch

There is no `--branch` flag. `BROS_REF` is the branch. Default is `main`. Set it on the shell that runs the script, before `bash`. A pipe does not pass `curl`'s environment into `bash`. Use `install.sh` from that same branch.

```bash
curl -fsSL https://raw.githubusercontent.com/jasenmichael/bros/development/scripts/install.sh | BROS_REF=development bash -s -- --from-src
```

For another branch, change `development` in both places.

## Service

Linux only. Add `--service` to any command above:

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
```

Already installed:

```bash
bros service install
```

The unit runs `bros -D`. It stops on logout unless linger is on (`loginctl enable-linger`). In a terminal, the installer also asks. A pipe does not ask. `--service` answers yes.

## Next

```bash
bros
```

Open [http://127.0.0.1:3055](http://127.0.0.1:3055).

Remove Bros: [Uninstall](/docs/uninstall.md). Paths and env: [Environment](/docs/environment.md).
