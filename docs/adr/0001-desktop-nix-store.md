# Desktop Nix store lives on the Desktop home

Devbox does not install Nix. Its first-run installer is Determinate `nix-installer`, which needs root and a daemon. The Desktop image keeps the pinned `devbox` binary and installs single-user Nix with the official installer (`--no-daemon`) as user `nix`.

`/nix` is a fixed path. Compose mounts `${BROS_HOST_DATA_DIR}/home/nix` there. The profile and Devbox data are `/home/bros/.nix` (`HOME` for user `nix`, `XDG_DATA_HOME=/home/bros/.nix/devbox`) on the existing home mount. A rebuilt image keeps the store and the profile.

The installer runs from `bros-live` when `/home/bros/.nix/.nix-profile/bin/nix` is missing. `nix.conf` sets `build-users-group` empty so Nix 2.35 does not look for the `nixbld` group. Nix package apps are not image layers. After the store exists, container start runs `devbox global add` for those packages. Other package kinds stay image layers.
