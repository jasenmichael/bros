---
title: Cohere
description: OpenAI-compat Cohere API. Trial key, non-commercial.
---

# Cohere

Cohere via the OpenAI compatibility endpoint. Trial key, 1,000 calls/month, non-commercial. Free-tier notes are Sep 2026 and change often. Bros uses the compat layer, not the native Cohere API.

## Key

Create a key at [Cohere Dashboard](https://dashboard.cohere.com/api-keys). Paste it on Models → Popular services → Cohere (cog). Keys live in SQLite, not env.

## Enable

1. Open Models
2. Popular services → Cohere → cog
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.cohere.ai/compatibility/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable in the cog; live `GET /models` merges when a key exists):

- `command-r-plus`
- `command-r`
