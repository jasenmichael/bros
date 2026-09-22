# PLAN — Bros

## Status

Implementation through **M7** complete. Install clones `BROS_HOME`, writes `~/.config/bros.yml`, and symlinks `~/.local/bin/bros`. Optional systemd --user. First `bros` start ensures sidecar Ollama and the internal `bros` model. Docker hot-reload is `pnpm dev`. See [PROGRESS.md](./PROGRESS.md).

## Milestones

1. **M0** — pnpm monorepo, theme + docs layers, app shell on :3055
2. **M1** — bootstrap config, SQLite, passcode
3. **M2** — sidecar engine + Sidecars page (`publish` Open/Pin; no path proxy)
4. **M3** — shipped sidecars: core Ollama; addon OpenCode + Open WebUI + Firecrawl + Firecrawl UI + Whisper (tunnel is host `cloudflared`, not a sidecar)
5. **M4** — Providers page
6. **M5** — Chat streaming + history
7. **M6** — docs content, compose prod/dev, root docs
8. **M7** — install + runner CLI (`BROS_HOME`, `~/.config/bros.yml`, `BROS_BIN` symlink, optional systemd --user, first-start Ollama + model `bros`; `pnpm dev` for bind-mount)

## Layer chain

`docs` extends `theme`. App (`/` = dashboard) and website (`/` = marketing) extend theme + docs. `/docs` is the same layer in both; theme owns layouts and markdown visualization.

## Follow-ups (unplanned)

Not a milestone. Pick when needed:

- CI: add test + typecheck jobs (Pages workflow only today)
- Tests: chat stream coverage; e2e beyond `/api/health`
- Additional sidecars: Add in the UI (`$BROS_HOME/data/sidecars/<id>/`) or clone a repo (`$BROS_HOME/data/sidecar-repos/<name>/`)
- Settings: Chat prepend + assistant description (SQLite `meta`), plus paths + passkey
- No auto-migrate of pre-rename Docker volumes
- Named `bros-data` / `bros-ollama-data` / sidecar volumes: leftover volumes stay unused; start does not copy them into `$BROS_HOME/data`
- Docs site: `pnpm docs:dev` → http://127.0.0.1:3056/bros/ ; generate + `pnpm --filter @bros/website preview`

## Data dir binds

Persistent sidecar + app state is `$BROS_HOME/data` on the host (`./data` in a checkout, `~/.bros/data` when installed).

## Recent (M7 install)

- `install.sh` clones `BROS_HOME` (`~/.bros`), writes `~/.config/bros.yml` if missing, symlinks `~/.local/bin/bros`, optional `bros service install` (systemd --user)
- `bros` is production compose only; `--dev` removed. Docker bind-mount is `pnpm dev` (`BROS_DEV=1`)
- First start starts sidecar Ollama and installs/updates internal model `bros` from `vendor/bros-model`

## Recent (internal specialist)

- Submodule `vendor/bros-model` ([jasenmichael/bros-model](https://github.com/jasenmichael/bros-model)). Sidecar ensure copies `models/` + `ollama/` + `scripts/` onto `$BROS_HOST_DATA_DIR/bros-model` and runs `ollama create bros` inside `bros-sc-ollama`. Name is reserved (not listed; `Label:` titles only).
- Model updates: bump the pinned submodule to the new bros-model tag/commit, then release a new Bros version. Checkout: `git submodule update --remote` (or pin a SHA) + `./bros update` when the GGUF size/mtime stamp differs. Do not treat host `ollama create` as the operator path.

## Recent (Chat thread)

- `/chat/:id` pins the thread (or overflowing main) to the latest turn after load.
- Assistant meta sits under the body. Whole-reply copy is stored raw markdown; snippet copy stays on `ProsePre`.
- User turns have copy + edit. Edit + resend: stop in-flight, `POST /api/chat/:id/truncate`, then stream the edited text. No extra `bros` retitle.

## Recent (Chat markdown)

- Chat message bodies use theme `.bros-prose` + `ProsePre` via `MDC` (same visualization as Docs `ContentRenderer`). No separate Tailwind `prose` stack.

## Recent (Chat nav)


- Chat page is conversation-only. Recents live in the dock under Status (open/collapsible; Rename + Delete). Bottom block: pinned sidecar UIs, then Docs (collapsible docs tree) + Settings, then GitHub. `/chat` = new; `/chat/:id` = saved. First successful reply titles via sidecar specialist `bros` (`Label:`); the name is not listed in Chat or Providers.

## Recent (two Ollamas)

- Sidecar YAML: `containerPort` + `publish` (Ollama host **11435**, OpenCode **4097**, Open WebUI **3080**, Firecrawl **3002**, Firecrawl UI **3081**)
- Host Ollama is its own Chat/Providers provider (`ollama-host`). Settings **Enable host Ollama** is off by default. Live scan: default **11434** first via `dockerHostCandidates()` / `127.0.0.1` (skip sidecar **11435** / `bros-sc-ollama`; app container cannot see host `/proc`), then Docker Ollama published ports (skip `bros-sc-ollama` / **11435**), then leftover listen/published candidates. `GET /api/version` must be Ollama JSON `version`. Skip `bros-sc-*` / **11435**. Manual `host_probe_port` override stays exclusive. `POST /api/providers/ollama-host/scan` busts the 30s cache.
- Start fails only if the Bros **publish** port is taken; host :11434 does not skip `bros-sc-ollama`

## Recent (Sidecars UI)

- `/sidecars` lists **Core** (Ollama) then one **Addon sidecars** section. Shipped OpenCode / Open WebUI / Firecrawl / Firecrawl UI and additional (data dir / git) share that list. Card source badges: **bros**, **repo**, **custom**. Each card has a refresh icon next to running/stopped. Add sidecar and From a repo stay on that section.
- Dashboard widget grid has no Sidecars summary card (Details/Manage). An **Ollama** card lists sidecar + host provider status (Details → `/providers`). **Bros services** lists every Bros-managed Docker container (app + sidecar stack services). Sidecar snippet rows stay below and show publish port only.

## Recent (Providers)

- Pull jobs persist in SQLite `ollama_pull_jobs`; one running pull per provider, extras queued. `POST /api/providers/:id/models/pull` returns `{ ok, job }`. Providers polls `GET /api/providers/:id/models/pull` (client-only interval after mount) and shows `UProgress` on that list row. Sidecar compose sets `OLLAMA_NOPRUNE=1`.
- Provider `upsertProvider` merges partial `config` (keeps `useGpu` when later POSTs patch other keys)
- Ollama start with `useGpu` force-recreates via `docker-compose.gpu.yml`
- Every provider row has a Chat switch (SQLite `providers.enabled`). Ollama sidecar + host default on; popular/custom default off until a saved key passes `GET /models` (or Ollama version probe). Off hides that provider from the Chat picker only. Installed Ollama models and popular catalog rows share a per-model Chat switch stored as `config.disabledModels` (default on). Off hides that model from that provider’s Chat picker. Ollama delete is a red ban icon with an Are you sure? confirm. Popular/custom catalog rows have no delete. Providers health badges are Ready / Need an API key / Invalid key / Unreachable, not running/stopped.
- Both Ollama cards (sidecar + host) load collapsed; opening one is in-session only. GPU and host port sit in that dropdown after the model list. Popular cards use the same pattern (models, then key/name settings). No settings cog on Ollama or Popular.

## Lifecycle (`bros`)

- `bros start` / `pnpm dev`: remove legacy `forgebox-sc-*` containers before up; app autostart uses project `bros-sc-<id>` only. First start also starts sidecar Ollama and installs/updates the internal `bros` model. Sidecar `ollama` always runs (no UI Start/Stop/Restart/autostart-off). A Nitro health plugin restarts it when the process or version probe is down and sets `ollamaRestartNotice` for one `useToast`. Addon packs autostart unless `BROS_SIDECAR_<ID>=0` or `BROS_SIDECARS_DISABLE`.
- `pnpm dev` start: `compose up` (no `--build`; first run still builds if `bros:dev` is missing). Rebuild: `pnpm dev:update`. Prod start stays `compose up --build`.
- `bros stop` and interactive Ctrl+C: stop all `bros-sc-*` sidecars, then core compose down (no orphan sidecar stacks)
- Optional Linux systemd --user unit: `bros service install` (`ExecStart=bros -D`)

## Host tunnel

`cloudflared` runs on the host. `bros` starts `scripts/bros-tunnel-helper.sh`, which owns the child process and files under `$BROS_HOME/data/tunnel`. `public_url` in bootstrap YAML is the enable + hostname signal (named tunnel + `route dns`). The container never spawns `cloudflared`. Compose-app Chat/Providers/STT use Docker DNS on network `bros`. `pnpm dev` over the tunnel serves Vite CSS-as-JS imports from `/_nuxt/bros-mod/…*.js` so Cloudflare cannot reuse a `text/css` cache entry for the Nuxt client.

## Recent (internal Docker APIs)

- Compose app reaches sidecar Ollama and Whisper via Docker DNS (`sidecarReachUrl`). Host publish is Open/Pin, host Node, and occupancy probes only. `BROS_OLLAMA_PORT` applies to host Node Chat the same way `BROS_WHISPER_PORT` does for STT. `appRunsInDocker` also treats `BROS_DATA_DIR=/data` / `BROS_WORKING_DIR=/app` as in-container.


## TODO:
- sections: chat, providers, agents, mcp, skills, issues
- data dirs structure for ollama, opencode, etc.
- thinking plus stop, allow pick new model and start typing for next chat.
- [x] add voice to text for chat using whisper
- providers/models, agents, mcp, acp, gateway, skills, tools(web research), loops????
- # Enterprise Role Architecture and Comprehensive AI Model Distribution
- implement ai agent roles.
roles:
  executive_and_strategy:
    description: "High-level reasoning, long-range planning, macro-market analysis, and asset evaluation."
    paid_tier_models:
      - "Claude Fable 5.1 (Anthropic) - #1 Choice for elite reasoning and deep strategy"
      - "GPT-6 Astra (OpenAI) - Best for cross-application agentic workflows and computer use"
      - "Claude Opus 5 (Anthropic) - Excellent complex-logic legacy foundation"
      - "GPT-5.6 Sol (OpenAI) - Fast execution of heavily multi-variable simulations"
    free_open_weight_models:
      - "Llama 4 Maverick (402B) - Ultimate enterprise-grade local reasoning baseline"
      - "DeepSeek-V3.2 / R1 - Top open reasoning model for structural planning"
      - "Muse Spark 1.3 - Leading open option for massive text-context processing"
      - "Mistral Large 3 - Solid European sovereign data choice for C-suite tasks"
    system_prompt: |
      You are the Chief Strategy Officer AI. Your goal is to analyze macro-market data, financial reports, and competitive threats to provide rigorous, long-term strategic recommendations. 
      - Always weigh opportunities against execution risks and resource costs.
      - Structure responses using executive frameworks (e.g., SWOT, Porter's Five Forces, MECE principles).
      - Maintain a decisive, objective, and analytical tone suitable for C-suite presentation.

  engineering_and_dev:
    description: "Production code generation, system architecture design, debugging, and code base parsing."
    paid_tier_models:
      - "Claude Fable 5.1 (via Cursor/IDE) - Absolute peak of the coding arena"
      - "GPT-5.6 Sol (xhigh) - Superior multi-file generation and continuous logic"
      - "GitHub Copilot (Enterprise) - Best out-of-the-box repository indexing"
    free_open_weight_models:
      - "Kimi K3 (Moonshot) - Leading Frontend Code Arena and SWE-bench open model"
      - "Qwen 2.5 Coder (72B) - Ultra-reliable, highly idiomatic local engineering"
      - "DeepSeek-V4-Pro - Top-tier autonomous coding agent capability"
      - "GLM-5.2 (Z.ai) - Excellent for complex local tool-use and function calling"
    system_prompt: |
      You are a Principal Software Engineer and System Architect AI. Your objective is to write production-ready, clean, secure, and idiomatic code while designing scalable system architectures.
      - Prioritize edge-case handling, data security, performance optimization, and extensive documentation.
      - Ensure all code is strictly modular, testable, and complies with modern design patterns.
      - Do not over-explain base concepts; deliver raw architectural code or pinpoint bugs directly.

  marketing_and_creative:
    description: "Multichannel copywriting, audience psychology modeling, campaign blueprints, and SEO localization."
    paid_tier_models:
      - "GPT-6 Astra (OpenAI) - Top choice for fast multimodal copy and ad variance generation"
      - "Claude 3.5 Sonnet - Best for structural narrative arcs and nuanced company branding"
      - "Gemini 3.1 Pro (Google) - Unmatched cost efficiency for processing massive media backlogs"
    free_open_weight_models:
      - "Google Gemma 4 (31B) - High-efficiency option that matches larger models on light hardware"
      - "Llama 4 (70B) - Great balance of tone control and custom brand fine-tuning"
      - "MiniMax M2.5 / M3 - Exceptional reinforcement learning foundation for ad variations"
    system_prompt: |
      You are a Lead Growth Marketer and Creative Director AI. Your focus is to write highly engaging, multi-channel copy and design targeted campaign blueprints that drive conversions.
      - Dynamically match the requested brand voice, tone, and audience demographics.
      - Optimize layouts and copy structures specifically for performance marketing (e.g., A/B testing variations, clear CTAs, emotional hooks).
      - Incorporate psychological triggers (scarcity, proof, authority) naturally without sounding overly salesy.

  customer_support_and_ops:
    description: "High-throughput ticketing, semantic triage, knowledge base lookup, and initial user interface."
    paid_tier_models:
      - "Gemini 3.8 Flash - Best budget-to-performance ratio for terminal automation"
      - "GPT-4o-mini - Gold standard API for sub-second, cheap customer routing"
      - "Claude 3.5 Haiku - Superior adherence to strict multi-step support workflows"
    free_open_weight_models:
      - "GLM-5.3-Flash - Industry-leading cost profile ($0.12/M tokens) for scale deployments"
      - "DeepSeek V4.1 Flash - Extremely snappy, low-latency chatbot engine"
      - "Mistral Small 4 - Compact and secure for self-hosted customer facing nodes"
      - "Phi-4 (14B) - Exceptionally smart small model for local client-side operations"
    system_prompt: |
      You are a Senior Customer Experience Specialist AI. Your mandate is to resolve customer inquiries, route issues, and streamline operational tasks instantly.
      - Maintain a polite, empathetic, concise, and highly professional tone under all circumstances.
      - Strictly cross-reference answers with provided internal knowledge bases or manuals.
      - De-escalate complaints efficiently and flag high-risk or complex edge cases for immediate human engineering review.

  legal_and_compliance:
    description: "Contract comparison, liability extraction, regulatory alignment audits, and legal memo verification."
    paid_tier_models:
      - "Claude Fable 5.1 (Adaptive Reasoning) - Unrivaled text analysis and logical rigor"
      - "Harvey AI / CoCounsel (Custom GPT-4o) - Purpose-built legal ecosystem with pre-vetted datasets"
      - "Claude 3.5 Sonnet - Best for objective, non-hallucinatory document editing"
    free_open_weight_models:
      - "Llama 4 Maverick (402B) - Crucial for local VPC deployment to guarantee privacy"
      - "Qwen 3.5 (72B+) - High instruction-following accuracy for long compliance texts"
      - "Laguna S 2.1 (MoE) - Praised for deep architectural context and local wise decisions"
    system_prompt: |
      You are a Corporate General Counsel AI. Your function is to execute hyper-precise contract analysis, identify hidden liabilities, and monitor global regulatory compliance.
      - Adopt an incredibly cautious, objective, and meticulous tone.
      - Highlight deviations from standard enterprise terminology and explicitly separate assumptions from verifiable statutory clauses.
      - Never fabricate legal precedents; prioritize absolute factual accuracy, and explicitly outline corporate risk exposure.

  human_resources_and_people:
    description: "Policy creation, bias-neutral talent review mapping, resume parsing, and internal wiki searching."
    paid_tier_models:
      - "Claude 3.5 Sonnet - Best-in-class empathetic yet neutral workplace tone"
      - "GPT-4o-mini - Cost-effective engine for parsing and screening bulk job applications"
      - "Workday AI Ecosystem - Pre-integrated into corporate HR records natively"
    free_open_weight_models:
      - "Qwen 2.5 (72B) - Excellent international multi-language localization"
      - "Gemma 4 (31B) - Lightweight and private for sensitive local employee analytics"
      - "Mistral Small 4 - Great for secure internal HR ticket auto-routing"
    system_prompt: |
      You are a Chief People Officer AI. Your goal is to draft clear workplace policies, evaluate talent retention patterns, and process employee feedback effectively.
      - Maintain strict confidentiality and adhere to universal workplace equity, bias mitigation, and labor compliance guidelines.
      - Use neutral, objective, and supportive language that reduces company friction.
      - Structure documentation clearly with a focus on internal clarity and unambiguous employee expectations.
