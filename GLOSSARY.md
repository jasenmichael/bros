# Glossary

Use these words in docs and architecture notes. One definition each.

## bros

The host command. The default action is start. Dev is `BROS_DEV=1 ./bros` or `./bros --dev`. Do not call this command the CLI.

## cli interface

An interface type on a sidecar: a command, no URL. Not the desktop sidecar. The Terminal page lists them under Expose CLIs.

## Browser app

Chat, Providers, Sidecars, Status, Settings, `/desktop`, and `/terminal`.

## Docs

Repo `docs/` served at `/docs` in the app and on the site. The app does not override those pages.

## Provider

A Chat backend row: the Ollama sidecar, host Ollama, a Popular service, or a custom OpenAI-compatible endpoint. The page is `/providers`.

## Model

A model id on a Provider. Chat stores `modelId` as `providerId/model`. Models are rows on a provider. HTTP is `/api/providers/{id}/models`.

## Chat

The `/chat` page. One streamed completion. There is no Agent page.

## Settings

The `/settings` page and the YAML toggles `enable_host_ollama` and `enable_whisper`.

## Status

The `/status` page. Bros app, Docker, disk, GPU, the host tunnel, and each sidecar.

## Bootstrap

`$BROS_DIR/data/config/bros.yml` plus data-dir files (passkey, proxy key, session secret).

## Sidecar

A Docker pack described by `sidecar.yml`. The product word is sidecar.

## Desktop home

One host directory. Desktop mounts the whole directory as its home. A sidecar mounts only the home subdirectories it declares.

## core sidecar

A pack under `lib/sidecars/core/`. Ollama and Desktop always start. Whisper starts only while Settings **Enable Whisper** is on. Env disable does not apply. The same tier on an app is always enabled.

## addon sidecar

A shipped pack under `lib/sidecars/addon/`. A fresh install does not start it. Autostart is off until the user turns it on or presses Start. An env disable keeps it listed and does not autostart it. The same tier on an app is shipped, listed, and off until enabled.

## custom sidecar

A user pack under `lib/sidecars/custom`. Same controls as an addon sidecar. Only `README.md` in that directory is tracked. The same tier on an app is user-defined and uses that install when enabled.

## Desktop

The core sidecar `desktop`. Always on. No host port. Image and container `bros-desktop`. The card is Desktop (core). `/desktop` is the Selkies stream of one Wayland session.

## Terminal

The `/terminal` page. The shell inside the desktop sidecar.

## app

A sidecar or a package install. Every sidecar is an app. Core, addon, and custom are the tiers for both.

## package app

A package install. `lib/apps/<tier>/<id>/config.yml` or `data/config/apps/<id>/config.yml`. Installed into the Desktop image. Runs inside `bros-desktop`.

## sidecar app

A sidecar. Its process stays in its own container. Desktop reaches it through a `cli` wrapper, a `gui` window, or a `webui` address.

## package manager

npm, pnpm, bun, deno, uv, cargo, nix (Devbox global), apt, deb, or run. npm, pnpm, bun, and uv are core apps. Their settings, cache, and packages live in the Desktop home. A later manager follows the same install, remove, and present rules.
