---
title: Agent
description: Capped tool loop. Chat stays model-only.
---

# Agent

`/agent` is a new empty thread with the same column as Chat: provider then model, centered greeting, composer, and voice-to-text mic. `/agent/:id` opens a saved thread. A thread is created on the first send. Saved threads stay in the dock under Previous agents. They do not appear under Previous chats, and they are not listed on the empty page.

The page matches Chat. The tool loop is the only difference. Chat does not gain these tools.

## Tools

Bros registers five read-only tools. The model sees ordinary JSON Schemas and chooses the calls. Results go back as tool results in that provider’s format, and the original tool-call object is replayed unchanged. The loop repeats until the model answers, or until 8 tool calls. The step after the cap is one normal completion with tools omitted.

- `list_dir`, `read_file`, `grep` — read the bootstrap working directory. A path that escapes that directory returns an error string.
- `web_search` — Firecrawl `POST /v2/search`
- `web_fetch` — Firecrawl `POST /v2/scrape` (markdown, capped)

`write_file`, `edit_file`, and `bash` are not registered.

Firecrawl must be running for the web tools. If it is stopped, the tool result says **Firecrawl sidecar is stopped** and the loop continues. A timed-out tool does the same.

A reply that is text and has no tool call is the answer. Bros does not search or read files on its own. A blank completion, or HTTP 400/422 because the endpoint has no tools, is one normal answer with tools omitted. There is no hidden web search.

`web_fetch` is allowed only for public `http` or `https` URLs from this turn’s search, or a public URL the user typed. An unknown tool name returns an error string and the loop continues. Provider errors (429, 401, 5xx) are one short sentence on the page, not the raw JSON.

## Send and Stop

While tools run, the waiting line shows **Searching …** or **Reading host**, then the answer streams. **Stop** aborts the model request and any in-flight Firecrawl call. Send stays disabled until the turn ends. The composer stays editable.

User turns show the same **Copy** and **Edit** controls as Chat. Edit + **Resend** stops any in-flight run, deletes that user turn and every later row (`POST /api/agent/:id/truncate`), then sends again through the Agent stream.

Sources sit under the answer. The next turn sees that answer and the source list, not the raw pages.

Reach from Bros: Docker DNS `http://firecrawl:3002` in the compose app, `http://127.0.0.1:3002` on host Node (`BROS_FIRECRAWL_PORT` overrides the host port).
