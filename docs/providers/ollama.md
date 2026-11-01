---
title: Ollama
description: Pull menu, GPU, disk margin, and Yours.
---

# Ollama

Docker app always appears under **Ollama** on Providers as **Ollama (core)**. Host (**Ollama (host port:N)**) appears only when Settings **Enable host Ollama** is on (off by default). Host stays listed when the daemon is down once enabled. Live scan (and the Scan button) probes default **11434** first from the app container via `dockerHostCandidates()` / from host Node via `127.0.0.1`, then other Ollama Docker published ports, then leftover listen/published candidates — never docker app **11435** or `bros-*`. Both cards load collapsed. Selecting a card expands pull and the installed-model list on that card. Chat defaults **on** for both. The provider switch only hides that provider from the Chat picker — it does not stop the docker app or host daemon. Each installed model also has a Chat switch (default on). Off stores the name in that provider’s `config.disabledModels` and hides it from that provider’s Chat picker; other models stay. Delete is a red ban icon and needs an Are you sure? confirm. Health is **Ready** or **Unreachable**, not running/stopped. Internal specialist `bros` still uses the docker app when Chat is off and stays unlisted.

## Pull menu

The catalog dropdown opens only while the input is empty. Type or select a valid name (`llama3.2`, community `owner/name:tag`, or HF `hf.co/user/repo:Q4_K_M`) to close it and enable Pull. Click the input again to reopen and pick something else. Catalog rows may show `name · size`; Pull uses the model name only.

1. **Yours** — names you added; kept after refresh in `config.customModels`
2. **Recommended** — official (and verified community) tags **≤ 16 GB**, sized for detected CPU/GPU VRAM
3. **Ollama** — registry names (`ollama pull llama3.2`)
4. **Hugging Face** — GGUF via `hf.co/user/repo` or `hf.co/user/repo:Q4_K_M`

`qwen3-coder:14b` is not a library tag. Use `freehuntx/qwen3-coder:14b` or `qwen2.5-coder:14b`. 30B tags (~19 GB) stay in the Ollama list, not Recommended.

Pull inserts a row at the top of that provider’s list immediately. The Pull button does not spin; the input clears so another name can be queued. Ollama runs **one pull at a time per provider** (`ollama` vs `ollama-host`). Further Pulls are `queued` and wait. Progress is on that list row — no Chat switch until the model is installed. Stop aborts a running fetch or drops a queued job. Resume calls pull again. Ban + Are you sure? stops a running pull, drops the job, and tries `DELETE /api/delete`; Ollama may keep incomplete blobs if the name was never fully installed.

Jobs persist in SQLite table `ollama_pull_jobs` (`$BROS_DIR/data/bros.sqlite`). After `bros` or container restart, incomplete rows still show; interrupted `running` jobs auto-resume (leftover blobs stay when `OLLAMA_NOPRUNE=1`).

Docker app compose sets **`OLLAMA_NOPRUNE=1`** so incomplete pulls are not pruned. Host Ollama is operator-owned: run the daemon with `OLLAMA_NOPRUNE=1` (systemd/env). Bros cannot set host daemon env.

Docker app pull keeps a **5 GB** disk margin on the Bros data volume. Models land in `$BROS_DIR/data/home/.ollama`. Host pull and chat use the host Ollama disk.

Pull HTTP (`:id` is `ollama` or `ollama-host`) lives in [API](/docs/api.md): `POST /api/providers/:id/models/pull`, `GET` the same path, `POST …/pull/stop`, `DELETE /api/providers/:id/models`.

## GPU

If an NVIDIA GPU is present, open the **docker app** card and enable **Use GPU** under the installed-model list. Host Ollama cannot configure GPU from Bros (`POST /api/providers/ollama/gpu` only — other ids 400).

Internal specialist `bros` is not listed. See [Ollama docker app](/docs/apps/ollama.md).
