---
title: OpenJEV sidecar
description: Jev-compatible System One decision API on host port 8092.
---

# OpenJEV sidecar

Shipped **addon** package `lib/sidecars/addon/openjev`. Open, Jev-compatible System One decision server ([razorback16/openjev](https://github.com/razorback16/openjev)). Enabled by default. Disable autostart with `BROS_SIDECAR_OPENJEV=0` or `BROS_SIDECARS_DISABLE=openjev`. Still listed under Addon sidecars as **OpenJEV (addon)**.

Needs an **NVIDIA GPU** (DiffusionGemma NVFP4 via vLLM). Default `OPENJEV_GPU_UTIL=0.80` leaves KV headroom after weights load. Default `OPENJEV_VLLM_ARGS=--kv-cache-dtype bfloat16` (Ampere SM86 cannot use FP8 KV with the image’s Triton attention backend; Ada SM89+ can override). Laya and Verdict stay in the stack but default to `OPENJEV_DEVICE=cpu` so encoder VRAM does not compete with the main model; set `OPENJEV_DEVICE=cuda` (and usually `OPENJEV_GPU_UTIL=0.9`) when the card has spare capacity. Weight init for this NVFP4 checkpoint still peaks near a full 16 GB — if vLLM OOMs while creating MoE layers or never binds `8092`, you need more VRAM (or lower `OPENJEV_MAX_MODEL_LEN` only helps KV after a successful load). Disable with `BROS_SIDECAR_OPENJEV=0` if desired.

Open/Pin target is FastAPI Swagger at `http://127.0.0.1:8092/docs` (available only after vLLM finishes loading; first start can take many minutes). Copy lists `http://127.0.0.1:8092/v1` and `http://openjev:8080/v1` (Bros network). Tunnel proxy: `/openjev/v1/…` (session or Settings proxy key).

## Ports

- API container: **8080**
- Host publish: **8092** (`BROS_OPENJEV_PORT` override)
- Bros never publishes host **3000** or **8080**

On the `bros` Docker network, other containers use `http://openjev:8080`.

## Stack

Compose uses Docker Hub images `razorback16/openjev:0.5.0`, `razorback16/openjev-laya:0.5.0`, and `razorback16/openjev-verdict:0.5.0` (upstream default: main OpenJEV + Laya + Verdict; CLM/JevK5 profiles not included). `ipc: host` and `gpus: all` on the GPU services. Healthcheck hits `/health` (start period 900s while weights load).

Main API routes:

- `POST /v1/systemone` — typed decisions
- `POST /v1/chat/completions` — OpenAI-style text (model `diffusiongemma-26b`)
- `GET /v1/models` — listed models

Optional env (passed through): `OPENJEV_API_KEY`, `OPENJEV_ORIGIN_SECRET`, `OPENJEV_GPU_UTIL` (default **0.80**; use **0.9** when VRAM allows), `OPENJEV_VLLM_ARGS` (default `--kv-cache-dtype bfloat16`), `OPENJEV_DEVICE` (encoders; default **cpu**, set **cuda** when VRAM allows), `OPENJEV_MAX_NUM_SEQS`, `OPENJEV_MAX_MODEL_LEN`, `OPENJEV_MODEL_ROUTES`, `HF_TOKEN`.

## Verify

After the model is loaded (first start downloads ~18 GB weights):

```bash
curl --fail --silent --show-error --max-time 5 \
  http://127.0.0.1:8092/v1/models
```

## Binds

- `$BROS_HOST_DATA_DIR/openjev/root/.cache/huggingface` → `/root/.cache/huggingface`
- `$BROS_HOST_DATA_DIR/openjev/root/.cache/vllm` → `/root/.cache/vllm`
- `$BROS_HOST_DATA_DIR/openjev/root/.cache/flashinfer` → `/root/.cache/flashinfer`

Hub: [Sidecars](/docs/sidecars).
