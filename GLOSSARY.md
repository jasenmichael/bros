# Glossary

Use these words in docs and architecture notes. One definition each.

## bros

The CLI. The text command typed in a terminal. The default action is start. Dev is `BROS_DEV=1 ./bros` or `./bros --dev`. The directory `cli/` is this Rust tree.

## cli interface

An interface type: a command, no URL. On a docker app. The Terminal page lists them under Expose CLIs.

## Browser app

Chat, Agents, Providers, Apps, Status, Settings, `/desktop`, and `/terminal`.

## Docs

Repo `docs/` served at `/docs` in the app and on the site. The app does not override those pages.

## Provider

A Chat backend row: the Ollama core app, host Ollama, a Popular service, or a custom OpenAI-compatible endpoint. The page is `/providers`.

## Model

A model id on a Provider. Chat stores `modelId` as `providerId/model`. Models are rows on a provider. HTTP is `/api/providers/{id}/models`.

## Chat

The `/chat` page. One streamed completion. There is no `/agent` page. The job board is Agents.

## Agents page

`/agents`. The board (Issues, Needs you, Queue, Failed, Completed), Add project under it, then Runtime closed until opened. Not the Agent app.
_Avoid_: Agent page

## Agent app

The addon that installs `agent`. Not the Agents page. Not the Cursor runtime. The runtime binary is `cursor-agent` under the Desktop home.

## Agent skill

A Cursor or Claude skill under repo `skills/`. Install with `npx skills@latest add jasenmichael/bros`. Not a Chat skill.
_Avoid_: skill (alone when Chat skills are in scope)

## Skill

A Chat prompt pack (`rules`, `personality`) under `lib/skills/`, seeded into `$BROS_HOME/data/config/skills`. Applies on Chat turns only. Not an Agent skill.
_Avoid_: agent skill

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

The `/status` page. Bros app, Docker, disk, GPU, the host tunnel, and each docker app.

## Bootstrap

`$BROS_DIR/bros.yml` plus data-dir files (passkey, proxy key, session secret).

## Desktop home

One host directory. Desktop mounts the whole directory as its home. A docker app mounts only the home subdirectories its compose file binds.

## Desktop

The Wayland session inside container `bros`. Container and image name are `bros`. `/desktop` is the Selkies stream of that session.

## UI host

The Node process that serves the browser app. Dev runs it on the host with `pnpm`. Prod runs it on the host when `pnpm` is on `PATH`, unless `--use-runner` or `BROS_USE_RUNNER=1` forces the UI runner. Otherwise the UI runner. It listens on `BROS_PORT`. It is not the desktop container.

## UI runner

Container `bros-ui`. The UI host when it runs in that container.
_Avoid_: runner CLI, runner

## desktop user

The user `bros` in the Bros container. Foot, the Terminal shell, and package processes are this user.
_Avoid_: terminal user

## Terminal

The `/terminal` page. The shell inside the Bros container. It is the same user as the desktop user.

## desktop entry

A freedesktop launcher record inside the Desktop container. Not an app.
_Avoid_: desktop app, .desktop app

## pinned launcher

A library app the user chose to keep on the Drawer. Terminal, a package gui, a docker-app gui, or a desktop entry. Not a package install.
_Avoid_: pin, custom app

## Drawer

The app launcher on `/desktop`. It sits at the bottom and shows on hover or touch.
_Avoid_: shelf

## app

A package install or a docker app. Core, addon, and custom are app tiers. The store page is `/apps`.

## core app

A shipped app under `lib/apps/core/<id>/`. Package cores (node, cargo, …) or docker cores (Ollama, Whisper). Docker cores are enabled by default; Settings may disable Whisper. Ollama stays enabled until a later Settings option exists.

## package app

A package install inside Desktop. `lib/apps/<tier>/<id>/config.yml` or `data/config/apps/<id>/config.yml`. Kinds are node, npm, pnpm, bun, deno, uv, cargo, apt, deb, nix, and run. A `kind: run` app is a Desktop image layer. Other kinds install into the Desktop home after the session is up. Runs inside container `bros`.

## docker app

An app whose `docker-compose.yml` is its own project. Kind is `docker`. Not a package manager. Interfaces are `cli`, `gui`, `api`, `webui`, and `openapi`. Shipped cores live in `lib/apps/core/<id>/`. Shipped addons live in `lib/apps/addon/<id>/`. Custom lives in `data/config/apps/<id>/`. Listed on `/apps`. Volume binds live in compose only.

## addon app

A shipped app under `lib/apps/addon/<id>/`. Docker addons stay stopped until Start or Autostart. Package addons are off until enabled. Also a card on `/apps`.

## custom app

An app under `data/config/apps/<id>/`. Not in the repo. Same directory shape as a shipped app. A custom package app is enabled when written. A custom docker app stays stopped until Start. Moving that directory to `lib/apps/addon/<id>/` or `lib/apps/core/<id>/` makes it an addon or a core app. The id and the kind stay. Enable flags stay outside the directory in `data/config/enabled-apps`. An addon package id in that file is not a custom app.

## desktop build

The Docker build context for `kind: run` apps. Bros writes it to `$BROS_DIR/data/build/desktop`. It is not an install prefix.

## package manager

npm, pnpm, bun, deno, uv, cargo, nix (Devbox global), apt, deb, or run. node, cargo, pnpm, bun, deno, and uv are core apps. npm is a kind. `docker` is not a package manager. Their settings, cache, and packages live in the Desktop home. A later manager follows the same install, remove, and present rules.

## global package

A top-level package a package manager reports inside the Desktop home. Not an app until a config exists.
_Avoid_: stray package
