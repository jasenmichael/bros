---
title: Anthropic
description: Claude via Anthropic OpenAI-compat. Paid.
---

# Anthropic

Anthropic Claude via their OpenAI-compatible layer. Paid. Bros does not use the native Messages API and does not seed `kind: anthropic`.

## Key

Create a key at [Anthropic Console](https://console.anthropic.com/settings/keys). Paste it on Providers → Popular services → Anthropic (open the card). Keys live in SQLite, not env.

## Enable

1. Open Providers
2. Popular services → Anthropic → open the card
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.anthropic.com/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions` (OpenAI-compat, not `/v1/messages`)

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `claude-sonnet-4-6`
- `claude-opus-4-7`
