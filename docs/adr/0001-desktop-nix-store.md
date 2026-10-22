---
title: Desktop Nix store
description: The Nix store stays in the Desktop image. The global profile is /opt/bros/devbox.
---

# Desktop Nix store stays in the image

Devbox global packages install into the Nix store. The Desktop home mount hides `/home/bros`, so the global profile lives at `/opt/bros/devbox`, the `devbox` command sets that directory, and bins are linked into `/usr/local/bin`. A BuildKit cache mount on `/nix` would drop the store when the layer commits, so the store stays in the image. `bros-pkg` holds a file binary cache (`nix copy`) so a rebuilt layer does not re-download. Devbox 0.18's own Nix installer starts a daemon that dies with the Docker RUN, so the image installs single-user Nix as root and Devbox uses that.
