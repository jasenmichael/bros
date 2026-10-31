---
title: Install
description: install.sh, BROS_DIR, first start, and the bros command.
---

# Install

A release needs Docker. It unpacks `bros-<os>-<arch>.tar.gz` (`bros-linux-amd64`, `bros-linux-arm64`, `bros-darwin-amd64`, or `bros-darwin-arm64`) into `~/.bros` and symlinks `~/.local/bin/bros` (`BROS_BIN`) to `$BROS_DIR/bros`. It does not build. The binary is in the tarball. The tarball includes the prebuilt UI at `app/ui/.output`, that `bros` binary, and `example.env`. It omits `vendor/` and the `app/` sources. Install copies `example.env` to `.env` when `.env` is absent and leaves `example.env` in place. `bros update` downloads the next tarball for this machine (`BROS_RELEASE_URL` overrides the exact URL), keeps `data/` and an existing `.env`, and refreshes `example.env`.

The product version is `0.0.1`. `lib/apps/core/ollama/BROS_MODEL_VERSION` is `1.0.0`, so this install downloads [bros-model `v1.0.0`](https://github.com/jasenmichael/bros-model/releases/download/v1.0.0/bros-model.tar.gz) when that stamp is missing or older. The next merge to `main` publishes tag `v0.0.1`. It does not bump the number. After `v0.0.1` and bros-model `v1.0.0` exist, a pull request's commit type chooses the next number (`feat` minor, `fix` and `perf` patch, `feat!` or a `BREAKING CHANGE` footer major). The merge tags that number and uploads the tarballs. A later bros-model release whose version changed opens a Bros pull request with that model release and a minor bump. A local pack does not bump `VERSION`:

```bash
pnpm --dir app --filter @bros/ui build
cargo build --release --manifest-path cli/Cargo.toml --target x86_64-unknown-linux-gnu
scripts/pack-release.sh --target x86_64-unknown-linux-gnu
```

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

A source install needs git and cargo once. After that, runtime is Docker. Dev still needs host `pnpm`.

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --from-src
```

That clones https://github.com/jasenmichael/bros.git into `~/.bros` (`BROS_DIR`), runs `cargo build --release` for `cli/`, points `$BROS_DIR/bros` at `cli/target/release/bros`, then symlinks `BROS_BIN` the same way as a release install. `--from-src` is the optional build path; the default release install never builds. Source `bros update` pulls, rebuilds the CLI, then rebuilds the image through the API. Prod (release or source) uses host Node/pnpm for the UI when available; a release runs the prebuilt `app/ui/.output` with host `node`. Without host Node/pnpm, or with `--use-runner` / `BROS_USE_RUNNER=1`, container `bros-ui` serves the UI. Dev always uses host `pnpm` and errors with either runner switch.

Optional systemd user service (Linux):

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash -s -- --service
```

`install.sh` default (release) path does not clone and does not build. The app reads `$BROS_DIR/bros.yml`. The installer writes that stub when missing. `BROS_BIN` is `~/.local/bin/bros`, a symlink to `$BROS_DIR/bros` (install-only; a checkout `cargo` build does not create it).

Overrides:

- `BROS_DIR` — install directory (default `~/.bros`). The `bros` binary lands here.
- `BROS_RELEASE_URL` — exact release tarball URL. Unset uses `https://github.com/jasenmichael/bros/releases/latest/download/bros-<os>-<arch>.tar.gz`
- `BROS_REPO` — git clone URL for `--from-src`
- `BROS_REF` — git ref for `--from-src` (default `main`)
- `BROS_CONFIG` — bootstrap YAML (default `$BROS_DIR/bros.yml`)
- `BROS_BIN` — PATH symlink (default `~/.local/bin/bros`)

At runtime, shell `BROS_DIR` wins; else `.env` beside the **real** binary (not the `BROS_BIN` symlink dir); else the real binary’s directory. Persistent binds live under `$BROS_DATA_DIR` (default `$BROS_DIR/data`).

## Uninstall

Release trees ship `uninstall.sh` next to `bros`. Default keeps `data/`, `.env`, and `bros.yml`; removes the shipped tree, `BROS_BIN`, and the systemd user unit:

```bash
~/.bros/uninstall.sh
# or: bros uninstall
```

Wipe everything including data:

```bash
bros uninstall --purge
```

Reinstall after a keep-data uninstall:

```bash
curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
```

Docs site: https://jasenmichael.github.io/bros/

## First start

```bash
bros
```

Interactive start. Ctrl+C stops the full stack: the UI, docker apps, then container `bros`. Install and `bros update` download the packaged model for `lib/apps/core/ollama/BROS_MODEL_VERSION` when the local stamp is missing or older, then the Ollama core app creates model `bros`. A newer stamp stays. `bros` start does not download. UI autostart brings up the Ollama docker app. Missing GGUF skips create. The CLI does not run `ollama create` itself.

Commands and flags: [bros](/docs/cli).

Open [http://127.0.0.1:3055](http://127.0.0.1:3055) (`BROS_HOST`:`BROS_PORT`). The passkey is printed in `$BROS_DATA_DIR/var/logs/bros.log` (`[bros] passkey:`).

Contributor hot-reload is `BROS_DEV=1 ./bros` or `./bros --dev` (host `pnpm` and `cargo`). See [Development](/docs/development).
