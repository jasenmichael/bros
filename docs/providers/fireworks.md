---
title: Fireworks AI
description: OpenAI-compat Fireworks inference. One-time trial only.
---

# Fireworks AI

Fireworks AI OpenAI-compatible inference. About $1 one-time trial only, then paid.

## Key

Create a key at [Fireworks](https://fireworks.ai/account/api-keys). Paste it on Providers → Popular services → Fireworks AI (open the card). Keys live in SQLite, not env.

## Enable

1. Open Providers
2. Popular services → Fireworks AI → open the card
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.fireworks.ai/inference/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `accounts/fireworks/models/llama-v3p3-70b-instruct`
