---
title: Perplexity
description: OpenAI-compat Sonar API. Paid.
---

# Perplexity

Perplexity Sonar via OpenAI-compatible Chat Completions. Paid. No lasting free API grant.

## Key

Create a key at [Perplexity API](https://www.perplexity.ai/settings/api). Paste it on Models → Popular services → Perplexity (cog). Keys live in SQLite, not env.

## Enable

1. Open Models
2. Popular services → Perplexity → cog
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.perplexity.ai`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable in the cog; live `GET /models` merges when a key exists):

- `sonar`
- `sonar-pro`
