---
title: Ollama models
description: Pull menu, GPU, disk margin, and Yours.
---

# Ollama models

Sidecar and host always appear under **Ollama** on Models. Host stays listed when the daemon is down. Both cards load collapsed. Selecting a card expands pull and the installed-model list on that card. Each row has a Chat switch that only hides that provider from the Chat picker.

## Pull menu

Pull from the menu or type any valid Ollama name (`llama3.2` or community `owner/name:tag`):

1. **Yours** — names you added; kept after refresh in `config.customModels`
2. **Recommended** — official (and verified community) tags **≤ 16 GB**, sized for detected CPU/GPU VRAM
3. **Ollama** — registry names (`ollama pull llama3.2`)
4. **Hugging Face** — GGUF via `hf.co/user/repo` or `hf.co/user/repo:Q4_K_M`

`qwen3-coder:14b` is not a library tag. Use `freehuntx/qwen3-coder:14b` or `qwen2.5-coder:14b`. 30B tags (~19 GB) stay in the Ollama list, not Recommended.

Sidecar pull keeps a **5 GB** disk margin on `$BROS_HOME/data/ollama`. Host pull/chat use the host Ollama disk — no Bros disk-fit check.

## GPU

If an NVIDIA GPU is present, open the **sidecar** cog and enable **Use GPU**. Host Ollama cannot configure GPU from Bros.

Internal specialist `bros` is not listed. See [Ollama sidecar](/docs/sidecars/ollama).
