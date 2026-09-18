---
title: Chat
description: Provider then model, streaming, thinking, Stop, and auto-title.
---

# Chat

`/chat` is a new empty conversation: provider dropdown then model dropdown, centered greeting and composer. `/chat/:id` opens a saved thread. A conversation is created on the first send, not when opening `/chat`.

## Provider then model

Chat order:

1. Ollama sidecar
2. Ollama host
3. Popular services (fixed catalog order)
4. Custom providers

Unconfigured popular cards still appear. Until `GET /models` succeeds, the model dropdown uses the preset list from Models. `modelId` is `providerId/model` (first slash splits the provider). Examples: `ollama/llama3.2`, `openai/gpt-4o-mini`, `groq/openai/gpt-oss-120b`.

Context size shows on the tools row **only for Ollama** when the runtime reports it.

## Send and Stop

While a reply is in flight, the composer shows **Stop** (aborts the stream) instead of send. Centered **thinking…** stays until the first assistant token or the request ends.

Assistant bodies render as markdown. Each assistant message stores the `modelId` used for that request. The UI shows `ASSISTANT · <modelId>` plus duration and token counts on the right when the provider sent them.

Popular services and custom providers both use OpenAI-compatible `POST /chat/completions`. Bros sends `stream_options.include_usage` when the body allows it, and reads `delta.content` or `delta.reasoning_content` (DeepSeek reasoner otherwise streams empty). OpenRouter requests add `HTTP-Referer` and `X-Title: Bros`.

## Auto-title

After the first successful assistant reply, sidecar specialist **bros** writes a short title from the first user prompt (`Label:`). Later messages do not retitle. If generate fails, keep `New chat` or the first line of the prompt.

The `bros` model is packaged GGUF installed into the Ollama sidecar on first start. It is **not listed** in Chat or Models. You never pick it. See [Ollama sidecar](/docs/sidecars/ollama).
