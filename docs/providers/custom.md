---
title: Custom providers
description: Add an OpenAI-compatible endpoint with a slug, base URL, and a key for Chat.
---

# Custom providers

**Add custom** lives under Custom providers on Providers. Custom rows are OpenAI-compatible: base URL + key + model names. Kind stays `openai`. Chat starts **off** until a key passes `GET /models`. Same Chat stream path as Popular services (`POST /chat/completions`).

## Slug rules

- Lowercase slug: `[a-z0-9][a-z0-9-]{0,62}`
- Cannot reuse built-in Ollama ids (`ollama`, `ollama-host`)
- Cannot reuse Popular services slugs (`openai`, `anthropic`, `gemini`, `groq`, `openrouter`, `mistral`, `cohere`, `deepseek`, `xai`, `together`, `fireworks`, `perplexity`)

## Contract

Bros calls `{baseUrl}/chat/completions` with `Authorization: Bearer <key>` when a key is set, and `{baseUrl}/models` to validate the key and merge live ids. Chat stays off without a successful probe. Provider CRUD: [API](/docs/api).

## Paste-in examples

Not Popular cards. Optional Custom rows:

- **Cloudflare Workers AI** — base URL includes your account id (`https://api.cloudflare.com/client/v4/accounts/<account>/ai/v1/openai`)
- **Hugging Face router** — OpenAI-compat router with a user token
- **NVIDIA NIM catalog** — `https://integrate.api.nvidia.com/v1`

LM Studio and vLLM are not supported (not presets, not localhost rewrite, not Compose packages).
