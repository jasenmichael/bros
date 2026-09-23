---
title: Agent
description: Research loop with Firecrawl search and scrape. Chat stays model-only.
---

# Agent

`/agent` is a new empty thread: the same provider dropdown then model dropdown as Chat, a centered greeting, and a composer. `/agent/:id` opens a saved thread. A thread is created on the first send. Saved threads list on the empty Agent page. They do not appear under Previous chats.

There is no microphone. Chat does not gain these tools.

## Tools

Bros implements two tools and runs them against the Firecrawl sidecar:

- `web_search` — `POST /v2/search`
- `web_scrape` — `POST /v2/scrape` (markdown, capped)

Firecrawl must be running. If it is stopped, the page says **Firecrawl sidecar is stopped**.

The model chooses the calls when Ollama or an OpenAI-compatible API returns `tool_calls`. Bros runs only the call the model named, sends the result back, and asks again. A reply with no tool call is the answer. The loop stops after 6 tool calls and then asks for a final answer.

Scrape is allowed only for public `http` or `https` URLs that search returned in that turn.

Some endpoints return 400 when a `tools` field is sent. Leftover Anthropic rows are not parsed for tool calls. In those cases Bros searches the user text, scrapes the top 3 hits, and the model only writes the answer.

## Send and Stop

While research runs, the waiting line shows **Searching …** or **Reading host**, then the answer streams. **Stop** aborts the model request and any in-flight Firecrawl call. Send stays disabled until the turn ends. The composer stays editable.

Sources sit under the answer. The next turn sees that answer and the source list, not the raw pages.

Reach from Bros: Docker DNS `http://firecrawl:3002` in the compose app, `http://127.0.0.1:3002` on host Node (`BROS_FIRECRAWL_PORT` overrides the host port).
