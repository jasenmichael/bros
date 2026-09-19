---
title: Models
description: Ollama, Popular services, and Custom providers.
---

# Models

`/models` has three sections, in order:

1. **Ollama** — sidecar + host, pull/GPU. See [Ollama](/docs/models-ollama).
2. **Popular services** — 12 built-in OpenAI-compatible cloud cards. Always listed, even with no key. See [Popular services](/docs/providers).
3. **Custom providers** — Add custom + your rows. See [Custom](/docs/models-custom).

Keys live in SQLite. There is no `OPENAI_API_KEY` env bootstrap.

## Status, Chat switch, and cog

Each row has a **Chat** switch (default on) and a settings cog. Off removes that provider from the Chat picker only — sidecar and host Ollama stay running, other providers are unchanged, and internal specialist `bros` still uses sidecar Ollama. Popular status is **running** when a key is saved, otherwise **stopped** (need a key). Endpoint label is the API host (copy / open), not the slug. Popular cards have no pull and no GPU. Popular rows cannot be deleted.

Ollama sidecar and host cards load **collapsed**. Open one to pull or list installed models; the other stays closed.

Chat provider order: sidecar, host, popular (catalog order), then custom — skipping Chat-disabled providers. Heading is **Popular services**, never “Paid providers”.

## Related

- [Chat](/docs/chat)
- [Ollama sidecar](/docs/sidecars/ollama)
