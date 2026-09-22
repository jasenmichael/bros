---
title: xAI
description: OpenAI-compat Grok API. Paid.
---

# xAI

xAI Grok via OpenAI-compatible Chat Completions. Paid. No lasting free API grant.

## Key

Create a key at [xAI Console](https://console.x.ai/). Paste it on Providers → Popular services → xAI (open the card). Keys live in SQLite, not env.

## Enable

1. Open Providers
2. Popular services → xAI → open the card
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.x.ai/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `grok-3`
- `grok-3-mini`
