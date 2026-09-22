---
title: OpenAI
description: OpenAI Chat Completions. Paid.
---

# OpenAI

OpenAI Chat Completions API. Paid. No lasting free API grant.

## Key

Create a key at [OpenAI API keys](https://platform.openai.com/api-keys). Paste it on Providers → Popular services → OpenAI (open the card). Keys live in SQLite, not env. There is no `OPENAI_API_KEY` bootstrap.

## Enable

1. Open Providers
2. Popular services → OpenAI → open the card
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.openai.com/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `gpt-4o-mini`
- `gpt-4o`
- `o4-mini`
