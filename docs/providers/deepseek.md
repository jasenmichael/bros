---
title: DeepSeek
description: OpenAI-compat DeepSeek. Cheap, not free. Reasoner uses reasoning_content.
---

# DeepSeek

DeepSeek OpenAI-compatible API. Cheap, not free. `deepseek-reasoner` streams thinking in `delta.reasoning_content`; Bros reads that so the reply is not empty.

## Key

Create a key at [DeepSeek Platform](https://platform.deepseek.com/api_keys). Paste it on Providers → Popular services → DeepSeek (open the card). Keys live in SQLite, not env.

## Enable

1. Open Providers
2. Popular services → DeepSeek → open the card
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.deepseek.com/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`
- Stream quirk: `delta.content` or `delta.reasoning_content`

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `deepseek-chat`
- `deepseek-reasoner`
