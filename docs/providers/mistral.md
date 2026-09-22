---
title: Mistral AI
description: OpenAI-compat Mistral API. Free mode plus monthly credits.
---

# Mistral AI

Mistral OpenAI-compatible API. Free mode plus about $10/month credits; training on unless opted out. Free-tier notes are Sep 2026 and change often.

## Key

Create a key at [Mistral Console](https://console.mistral.ai/api-keys). Paste it on Providers → Popular services → Mistral AI (open the card). Keys live in SQLite, not env.

## Enable

1. Open Providers
2. Popular services → Mistral AI → open the card
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.mistral.ai/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `mistral-small-latest`
- `mistral-large-latest`
- `codestral-latest`
