---
title: Perplexity
description: OpenAI-compat Sonar API. Paid.
---

# Perplexity

Perplexity Sonar via OpenAI-compatible Chat Completions. Paid. No lasting free API grant.

## Key

Create a key at [Perplexity API](https://www.perplexity.ai/settings/api). Paste it on Providers → Popular services → Perplexity (open the card). Keys live in SQLite, not env.

## Enable

1. Open Providers
2. Popular services → Perplexity → open the card
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.perplexity.ai`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `sonar`
- `sonar-pro`
