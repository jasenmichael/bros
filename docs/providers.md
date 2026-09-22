---
title: Providers
description: Ollama, Popular services, and Custom providers.
---

# Providers

`/providers` has three sections, in order:

1. **Ollama** — sidecar + host, pull/GPU. See [Ollama](/docs/providers/ollama).
2. **Popular services** — 12 built-in OpenAI-compatible cloud cards. Always listed, even with no key.
3. **Custom providers** — Add custom + your rows. See [Custom](/docs/providers/custom).

Keys live in SQLite. There is no `OPENAI_API_KEY` env bootstrap. HTTP for this page is documented in [API](/docs/api).

## Status, Chat switch, and dropdown

Each row has a **Chat** label above the switch. Off removes that provider from the Chat picker only — sidecar and host Ollama stay up, other providers are unchanged, and internal specialist `bros` still uses sidecar Ollama. Ollama Chat defaults **on**. Popular and custom Chat default **off** until you save a key and Bros confirms it with a live API check (`GET /models` on that provider). Health badges: **Ready**, **Need an API key**, **Invalid key**, **Unreachable** — not running/stopped. Endpoint label is the API host (copy), not the slug. Popular rows open the provider console/keys page (`siteUrl` on the preset), not the API host. Ollama rows still copy and open the local `127.0.0.1` endpoint. Popular cards have no pull and no GPU. Popular rows cannot be deleted.

Ollama sidecar always appears; host appears when Settings enable host Ollama is on. Both cards load **collapsed**. Open one to pull or list installed models; settings (sidecar GPU, host port) sit **after** that list. The pull menu opens only while the input is empty and matches the input width. Pick or type a valid name to enable Pull (catalog labels include size; the stored name does not). Pull adds a row at the top immediately with progress and no Chat switch; the button does not spin. Jobs persist in SQLite and survive a Bros restart. One pull runs at a time per Ollama; extra Pulls wait in the same list. Stop / Resume / confirm-delete apply to incomplete rows. Each installed Ollama row has a Chat switch (off hides that model from that provider’s Chat picker; default on unless stored in `config.disabledModels`) and a compact red ban icon to delete. Delete opens an Are you sure? confirm; cancel does nothing. Host card notes that the daemon should run with `OLLAMA_NOPRUNE=1`. Popular cards also load collapsed: open one for the model list, then key/name/models settings under it. Each listed popular model has the same Chat switch (same `config.disabledModels` store; default on). Off hides that id from that provider’s Chat picker. There is no delete on popular or custom catalog rows — Bros does not own the remote catalog. The models textarea is a seed/fallback, not an allowlist; live `GET /models` still lists every id on the card. Custom rows still use a settings cog (UModal). There is no settings cog on Ollama or Popular services.

Chat provider order: sidecar, host, popular (catalog order), then custom — skipping Chat-disabled providers. Heading is **Popular services**, never “Paid providers”.

## Popular services

Twelve majors, always listed. OpenAI-compatible Chat Completions. None of the 12 APIs are unlimited free — Ollama (already in Bros) is the unlimited local path. Free-tier notes on each cloud page are Sep 2026; they change often. Bros does not hard-code quotas in the UI.

- [Google Gemini](/docs/providers/gemini)
- [Groq](/docs/providers/groq)
- [OpenRouter](/docs/providers/openrouter)
- [Mistral AI](/docs/providers/mistral)
- [Cohere](/docs/providers/cohere)
- [OpenAI](/docs/providers/openai)
- [Anthropic](/docs/providers/anthropic)
- [DeepSeek](/docs/providers/deepseek)
- [xAI](/docs/providers/xai)
- [Together AI](/docs/providers/together)
- [Fireworks AI](/docs/providers/fireworks)
- [Perplexity](/docs/providers/perplexity)

Not in this section: Ollama `/v1` (duplicate of built-in Ollama), native Gemini/Cohere/Anthropic SDKs. Anthropic uses their OpenAI-compat layer. Custom paste-ins (Cloudflare, Hugging Face, NVIDIA) belong under [Custom providers](/docs/providers/custom).

## Related

- [Chat](/docs/chat)
- [Ollama sidecar](/docs/sidecars/ollama)
- [API](/docs/api)
