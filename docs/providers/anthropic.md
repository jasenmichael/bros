---
title: Anthropic
description: Claude via Anthropic Messages API. Paid.
---

# Anthropic

Anthropic Claude via the Messages API. Paid. Popular Anthropic is seeded as `kind: anthropic`.

## Key

Create a key at [Anthropic Console](https://console.anthropic.com/settings/keys). Paste it on Providers → Popular services → Anthropic (open the card). Keys live in SQLite, not env.

## Enable

1. Open Providers
2. Popular services → Anthropic → open the card
3. Paste the key, Save

Status is **Ready** after a live `GET /models` with that key succeeds. A saved key alone is not Ready.

## API

- Base URL: `https://api.anthropic.com/v1`
- Auth: `x-api-key: <key>` plus `anthropic-version: 2023-06-01`
- Chat: `POST /messages`
- Probe: `GET /models` with the same Anthropic headers

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `claude-sonnet-4-6`
- `claude-opus-4-7`
