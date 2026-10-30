# App launch lives in the app directory

A package app that must choose a binary or prepare files ships `launch.sh` beside `config.yml`. Core, addon, and custom use the same directory. Desktop start copies that file to `$HOME/.local/app-bins/<bin>` and does not name the app.

`config.yml` holds env and args when that is the whole launch. The script is only the extra step. Moving an app between tiers moves the directory.

The Desktop container has no GPU and blocks user namespaces. Session software OpenGL covers Ubuntu's Mesa. It does not set `LD_LIBRARY_PATH`, because that breaks Nix glibc. Cursor's script still passes `--no-sandbox`. Ghostty's script still shows Ubuntu's Mesa to the Nix OpenGL loader. The next Electron app needs the same flag in its own script until the sandbox namespace is allowed.
