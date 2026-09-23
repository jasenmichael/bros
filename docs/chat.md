---
title: Chat
description: Provider then model, streaming, thinking, Stop, and auto-title.
---

# Chat

`/chat` is a new empty conversation: provider dropdown then model dropdown, centered greeting and composer. `/chat/:id` opens a saved thread and pins the scroller to the latest turn after render (every conversation id). A conversation is created on the first send, not when opening `/chat`.

## Provider then model

Chat order:

1. Ollama (core) sidecar
2. Ollama (host) — only when Settings enable host Ollama is on
3. Popular services (fixed catalog order)
4. Custom providers

Popular and custom cards stay out of the Chat picker until their **Chat** switch is on (off by default; requires a valid key and a healthy probe). Ollama sidecar and host start in the picker (Chat on by default). That switch never stops sidecar or host Ollama. Models with their per-model switch off (Ollama, popular, or custom) are omitted from that provider’s model dropdown. Until the provider’s remote `GET /models` succeeds, the model dropdown uses the preset list from Providers. The trigger stays compact; the open menu is wide enough for full Ollama names (`llama2-uncensored:latest`, `freehuntx/qwen3-coder:14b`). `modelId` is `providerId/model` (first slash splits the provider). Examples: `ollama/llama3.2`, `openai/gpt-4o-mini`, `groq/openai/gpt-oss-120b`. If the selected Chat model’s provider is then disabled, Chat falls back to the next enabled provider.

Context size shows on the tools row **only for Ollama** when the runtime reports it.

## Send and Stop

While a reply is in flight, Send stays the arrow and is disabled until the stream ends. The composer stays editable (type the next prompt; cannot send yet). Centered **thinking…** shows elapsed time (`1.2s`) and **Stop** until the first assistant token. After tokens start, **Stop** sits on the live assistant meta line. **Stop** aborts the stream.

A round **Voice to text** mic sits left of Send. Click starts recording; click again stops and uploads to `POST /api/chat/transcribe`. Transcribed text appends to the composer and does not auto-send. Recording is allowed while a reply streams (next prompt). Microphone needs a secure context (localhost HTTP or HTTPS). The Whisper sidecar is STT only — not a Chat provider. It stays stopped until Settings **Enable Whisper**. While that switch is off, transcribe returns an error and does not pull images. See [Whisper sidecar](/docs/sidecars/whisper).

Assistant and user bodies render as markdown with the same theme prose as Docs (`.bros-prose` + `ProsePre`). Each assistant message stores the `modelId` used for that request. The UI shows `ASSISTANT · <modelId>` **under** the assistant body, plus duration and token counts on the right when the provider sent them. A copy icon next to that meta copies the stored raw markdown of the whole reply (fences included). Fenced snippets still have their own `ProsePre` copy.

User turns show **Copy** and **Edit** under the bubble. Edit + **Resend** stops any in-flight stream (same abort as **Stop**), deletes that user turn and every later row (`POST /api/chat/:id/truncate` with `fromMessageId` / `fromIndex`), then sends the edited text with the same Chat settings prepend/description as a normal send. Title still auto-titles only the first successful reply of a New chat.

Popular services and custom providers both use OpenAI-compatible `POST /chat/completions`. Bros sends `stream_options.include_usage` when the body allows it, and reads `delta.content` or `delta.reasoning_content` (DeepSeek reasoner otherwise streams empty). OpenRouter requests add `HTTP-Referer` and `X-Title: Bros`.

Settings Chat extras apply on each user send (stateless providers need them every request). Stored turns stay as typed. Empty fields are omitted.

- one `system` message = assistant description (merged into an existing first system if the client already sent one; never a second system every turn)
- last `user` = `{prepend}\n\n{user text}` when prepend is set

Ollama and OpenAI-compat send that array. Anthropic uses the same description as `system` and the same user prefix. Internal `bros` title generate is unchanged (`Label:` only).

## Auto-title

After the first successful assistant reply, sidecar specialist **bros** writes a short title from the first user prompt (`Label:`). Later messages do not retitle. If generate fails, keep `New chat` or the first line of the prompt.

The `bros` model is packaged GGUF installed into the Ollama sidecar on first start. It is **not listed** in Chat or Providers. You never pick it. See [Ollama sidecar](/docs/sidecars/ollama).
