# Desktop Nix stays on the mounted store

Devbox and Nix are not image layers. Container start runs one command, as the desktop user, when `devbox` is not already installed:

`curl -fsSL https://get.jetify.com/devbox | bash`

The Desktop home and `/nix` are already mounted. A cached Nix binary is placed on that command's `PATH`. Devbox installs Nix in single-user mode only when Nix is not already present. The store, the Nix database, and the profile then stay on those mounts.

`/nix` is `$BROS_DIR/data/home/nix`. The command runs only when `devbox` is not already installed. A cached Nix binary from that store is placed on the command's `PATH`, so Devbox does not download Nix again. Ensure does not install Nix.

Devbox global data uses `$XDG_DATA_HOME/devbox` (`/home/bros/.local/share/devbox`). Nix user state uses `use-xdg-base-directories`, so profiles live at `/home/bros/.local/state/nix`. Compose does not set `NIX_STORE_DIR`. Binary-cache packages contain `/nix/store` paths.

Desktop `PATH` prepends `$HOME/.local/docker app-bins` only. The shell hook Devbox writes on the Desktop home adds package bins.

Nix package apps are not image layers. Ensure runs `devbox global add` for them, one at a time, and skips a command that already runs.
