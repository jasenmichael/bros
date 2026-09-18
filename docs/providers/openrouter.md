---
title: OpenRouter
description: OpenAI-compat router. Free slugs are rate-limited.
---

# OpenRouter

OpenRouter OpenAI-compatible router. Whole catalog is paid except `:free` slugs and the free router (50 req/day until $10 lifetime spend). Free-tier notes are Sep 2026 and change often.

Bros sends extra headers on every Chat request: `HTTP-Referer` (Bros GitHub repo) and `X-Title: Bros`.

## Key

Create a key at [OpenRouter](https://openrouter.ai/keys). Paste it on Models → Popular services → OpenRouter (cog). Keys live in SQLite, not env.

## Enable

1. Open Models
2. Popular services → OpenRouter → cog
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://openrouter.ai/api/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`
- Extra headers: `HTTP-Referer`, `X-Title: Bros`

Default model ids (editable in the cog; live `GET /models` merges when a key exists):

- `openrouter/free`
- `google/gemini-2.5-flash:free`
- `meta-llama/llama-3.3-70b-instruct:free`
