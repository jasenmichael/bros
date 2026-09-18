---
title: Groq
description: OpenAI-compat Groq API. Free plan is rate-limited.
---

# Groq

Groq OpenAI-compatible inference. Free plan exists; Llama left Groq free/developer in Aug 2026. Free-tier notes are Sep 2026 and change often.

## Key

Create a key at [Groq Console](https://console.groq.com/keys). Paste it on Models → Popular services → Groq (cog). Keys live in SQLite, not env.

## Enable

1. Open Models
2. Popular services → Groq → cog
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://api.groq.com/openai/v1`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable in the cog; live `GET /models` merges when a key exists):

- `openai/gpt-oss-120b`
- `openai/gpt-oss-20b`
- `qwen/qwen3.6-27b`
