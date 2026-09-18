---
title: xAI
description: OpenAI-compat Grok API. Paid.
---

# xAI

xAI Grok via OpenAI-compatible Chat Completions. Paid. No lasting free API grant.

## Key

Create a key at [xAI Console](https://console.x.ai/). Paste it on Models → Popular services → xAI (cog). Keys live in SQLite, not env.

## Enable

1. Open Models
2. Popular services → xAI → cog
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.x.ai/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable in the cog; live `GET /models` merges when a key exists):

- `grok-3`
- `grok-3-mini`
