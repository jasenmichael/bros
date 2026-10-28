# Glossary

Use these words in docs and architecture notes. One definition each.

## bros

The host command. The default action is start. Dev is `BROS_DEV=1 ./bros` or `./bros --dev`. Do not call this command the CLI.

## cli interface

An interface type on a sidecar: a command, no URL. Not the desktop sidecar. The Terminal page lists them under Expose CLIs.

## Browser app

Chat, Agents, Providers, Sidecars, Status, Settings, `/desktop`, and `/terminal`.

## Docs

Repo `docs/` served at `/docs` in the app and on the site. The app does not override those pages.

## Provider

A Chat backend row: the Ollama sidecar, host Ollama, a Popular service, or a custom OpenAI-compatible endpoint. The page is `/providers`.

## Model

A model id on a Provider. Chat stores `modelId` as `providerId/model`. Models are rows on a provider. HTTP is `/api/providers/{id}/models`.

## Chat

The `/chat` page. One streamed completion. There is no `/agent` page. The job board is Agents.

## Agents page

`/agents`. The board (Issues, Needs you, Queue, Failed, Completed), Add project under it, then Runtime closed until opened. Not the Agent app.
_Avoid_: Agent page

## Agent app

The addon that installs `agent`. Not the Agents page. Not the Cursor runtime. The runtime binary is `cursor-agent` under the Desktop home.

## Workspace

The Desktop working directory. Host path `BROS_HOST_WORKSPACE`, else `bros.yml` `workspace`, else `data/home/workspace`. Inside Desktop it is `/home/bros/workspace`.

## Repo

One git directory under Workspace. The directory name is the repo name. The cwd for a job is that directory. Also called a project.
_Avoid_: worktree

## GitHub token

The one credential for GitHub API calls and for `git` against GitHub inside Desktop. Set on the Agents page. On startup, a set `GH_TOKEN`, else `GITHUB_TOKEN`, else `GITHUB_PAT`, replaces it.

## Issue

A GitHub issue on a repo.

## Job

One run of an issue through preflight, implement, and the pull request.

## Task Spec

The plan PreFlight writes. The user can edit it before implement.

## Issue branch

The job branch `{kind}/{slug}`. It is the pull request head.

## PR base

Per repo, `staging` or `main`. The issue branch's pull request targets that branch. Default `staging`.

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

A shipped pack under `lib/sidecars/addon/`. A fresh install does not start it. Autostart is off until the user turns it on or presses Start. An env disable keeps it listed and does not autostart it. Start still runs it, and the id stays reserved. The same tier on an app is shipped, listed, and off until enabled.

## custom sidecar

A user pack under `lib/sidecars/custom`. Same controls as an addon sidecar. Only `README.md` in that directory is tracked. The same tier on an app is user-defined and uses that install when enabled.

## Desktop

The core sidecar `desktop`. Always on. No host port. Image and container `bros-desktop`. The card is Desktop (core). `/desktop` is the Selkies stream of one Wayland session.

## desktop user

The user `bros` in the Desktop container. Foot, the Terminal shell, and package processes are this user.
_Avoid_: terminal user

## Terminal

The `/terminal` page. The shell inside the desktop sidecar. It is the same user as the desktop user.

## desktop entry

A freedesktop launcher record inside the Desktop container. Not an app.
_Avoid_: desktop app, .desktop app

## pinned launcher

A library app the user chose to keep on the Drawer. Terminal, a package gui, a sidecar gui, or a desktop entry. Not a package install. 
_Avoid_: pin, custom app

## Drawer

The app launcher on `/desktop`. It sits at the bottom and shows on hover or touch.
_Avoid_: shelf

## app

A sidecar or a package install. Every sidecar is an app. Core, addon, and custom are the tiers for both. It can expose one or more `webui`, `gui`, or `cli` interfaces.

## package app

A package install. `lib/apps/<tier>/<id>/config.yml` or `data/config/apps/<id>/config.yml`. A `kind: run` app is a Desktop image layer. Other kinds install into the Desktop home after the session is up. Runs inside `bros-desktop`.

## desktop build

The Docker build context for `kind: run` apps. Bros writes it to `$BROS_DIR/data/build/desktop`. It is not an install prefix.

## sidecar app

A sidecar. Its process stays in its own container. Desktop reaches it through a `cli` wrapper, a `gui` window, or a `webui` address.

## package manager

npm, pnpm, bun, deno, uv, cargo, nix (Devbox global), apt, deb, or run. node, cargo, pnpm, bun, deno, and uv are core apps. npm is a kind. Their settings, cache, and packages live in the Desktop home. A later manager follows the same install, remove, and present rules.
