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

## Status and cog

Each row has a settings cog. Popular status is **running** when a key is saved (and enabled), otherwise **stopped** (need a key). Endpoint label is the API host (copy / open), not the slug. Popular cards have no pull and no GPU. Popular rows cannot be deleted.

Chat provider order: sidecar, host, popular (catalog order), then custom. Heading is **Popular services**, never “Paid providers”.

## Related

- [Chat](/docs/chat)
- [Ollama sidecar](/docs/sidecars/ollama)
