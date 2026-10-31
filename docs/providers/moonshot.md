---
title: Moonshot
description: OpenAI-compat Moonshot (Kimi) API. Paid.
---

# Moonshot

Moonshot (Kimi) OpenAI-compatible API. Paid.

## Key

Create a key at [Moonshot Platform](https://platform.moonshot.ai/console/api-keys). Paste it on Providers → Popular services → Moonshot (open the card). Keys live in SQLite, not env.

## Enable

1. Open Providers
2. Popular services → Moonshot → open the card
3. Paste the key, Save

Status is **Ready** after a live `GET /models` with that key succeeds. A saved key alone is not Ready.

## API

- Base URL: `https://api.moonshot.ai/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `kimi-k2.5`
- `moonshot-v1-128k`
