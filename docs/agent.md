---
title: Agent
description: The agent page and custom tool loop are gone. Chat is one completion.
---

# Agent

There is no `/agent` page and no `/api/agent`. Chat at `/chat` is one direct completion. Bros does not run a tool loop.

A later cut can drive tools through the OpenCode sidecar, an OpenHands sidecar, or the TrueForge sidecar. Bros does not embed the OpenHands SDK or `@truefoundry/trueforge-ui`.

TrueForge (`sidecars/trueforge`, publish **8791**) is the reusable-agent sidecar. Open its own UI from Sidecars. Chat still does not run a tool loop.

Tunneled sidecar APIs are separate from chat. See [Tunnel](/docs/tunnel).
