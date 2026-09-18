---
title: Mistral AI
description: OpenAI-compat Mistral API. Free mode plus monthly credits.
---

# Mistral AI

Mistral OpenAI-compatible API. Free mode plus about $10/month credits; training on unless opted out. Free-tier notes are Sep 2026 and change often.

## Key

Create a key at [Mistral Console](https://console.mistral.ai/api-keys). Paste it on Models → Popular services → Mistral AI (cog). Keys live in SQLite, not env.

## Enable

1. Open Models
2. Popular services → Mistral AI → cog
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.mistral.ai/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable in the cog; live `GET /models` merges when a key exists):

- `mistral-small-latest`
- `mistral-large-latest`
- `codestral-latest`
