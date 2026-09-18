---
title: Together AI
description: OpenAI-compat Together inference. Trial credit ended.
---

# Together AI

Together AI OpenAI-compatible inference. Trial credit ended. Paid.

## Key

Create a key at [Together](https://api.together.xyz/settings/api-keys). Paste it on Models → Popular services → Together AI (cog). Keys live in SQLite, not env.

## Enable

1. Open Models
2. Popular services → Together AI → cog
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.together.xyz/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable in the cog; live `GET /models` merges when a key exists):

- `meta-llama/Llama-3.3-70B-Instruct-Turbo`
