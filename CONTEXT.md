# Context

Domain names for Bros. Use these words in docs and architecture notes.

## Provider

A Chat backend row: the Ollama sidecar, host Ollama, a Popular service, or a custom OpenAI-compatible endpoint. Stored in SQLite. The page is `/providers`.

## Model

A model id on a Provider. Chat stores `modelId` as `providerId/model`. Models are rows on a provider. HTTP is `/api/providers/{id}/models`.

## Settings

The `/settings` page and the YAML toggles `enable_host_ollama` and `enable_whisper`. The module is `src/server/utils/settings`.

## Bootstrap

`$BROS_DIR/bros.yml` plus data-dir files (passkey, proxy key, session secret). Loaded by `src/server/utils/config.ts`.

## Sidecar

A Docker pack described by `sidecar.yml`. The product word is sidecar.

## CLI

The `bros` command. The default action is start. Dev is `BROS_DEV=1 ./bros`.
