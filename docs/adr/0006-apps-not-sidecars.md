# 0006. Apps not docker apps

## Status

Accepted

## Context

Bros used “docker app” for Ollama/Whisper under `lib/apps/` and “app” for package and docker packs under `lib/apps/`. The UI page became `/apps` while discovery still mixed worlds. Product language said Apps; packs and APIs still said docker app.

## Decision

- Ollama and Whisper live under `lib/apps/core/` as `kind: docker` (`config.yml` + compose), same shape as addon/custom docker apps.
- `/apps` is the app store for docker (core/addon/custom) and package apps.
- Core docker apps are enabled by default. Settings can disable Whisper today. Ollama stays enabled this pass; a later Settings flag may disable it when other Chat providers exist.
- Non-core docker apps keep Autostart (SQLite + boot).
- Env disable keys stay `BROS_APP_*` for now. Compose control routes remain under `/api/apps/*`. Store list is `GET /api/apps`.

## Consequences

- No shipped packs under `lib/apps/` except leftover `custom/` docs if any.
- GLOSSARY retires Docker app as a product tier; App covers core docker too.
- Must-run and Whisper Settings behavior unchanged.
