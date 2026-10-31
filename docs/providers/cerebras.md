---
title: Cerebras
description: OpenAI-compat Cerebras inference. Paid.
---

# Cerebras

Cerebras OpenAI-compatible inference. Paid.

## Key

Create a key at [Cerebras Cloud](https://cloud.cerebras.ai/). Paste it on Providers → Popular services → Cerebras (open the card). Keys live in SQLite, not env.

## Enable

1. Open Providers
2. Popular services → Cerebras → open the card
3. Paste the key, Save

Status is **Ready** after a live `GET /models` with that key succeeds. A saved key alone is not Ready.

## API

- Base URL: `https://api.cerebras.ai/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `llama-3.3-70b`
- `qwen-3-32b`
