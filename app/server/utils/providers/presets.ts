export type ProviderPresetKind = 'openai' | 'anthropic'

export type ProviderPreset = {
  id: string
  name: string
  kind: ProviderPresetKind
  baseUrl: string
  /** Human-facing console/keys page. Models popular rows open this, not the API host. */
  siteUrl: string
  models: string[]
  headers?: Record<string, string>
}

/** Built-in cloud providers. Seeded into SQLite; not a paid catalog. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    siteUrl: 'https://aistudio.google.com/api-keys',
    models: ['gemini-3.8-flash'],
  },
  {
    id: 'groq',
    name: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    siteUrl: 'https://console.groq.com/keys',
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    siteUrl: 'https://openrouter.ai/keys',
    models: ['openrouter/free', 'google/gemini-2.5-flash:free', 'meta-llama/llama-3.3-70b-instruct:free'],
    headers: {
      'HTTP-Referer': 'https://github.com/jasenmichael/bros',
      'X-Title': 'Bros',
    },
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    siteUrl: 'https://console.mistral.ai/api-keys',
    models: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    kind: 'openai',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    siteUrl: 'https://dashboard.cohere.com/api-keys',
    models: ['command-r-plus', 'command-r'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    siteUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o-mini', 'gpt-4o', 'o4-mini'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    siteUrl: 'https://console.anthropic.com/settings/keys',
    models: ['claude-sonnet-4-6', 'claude-opus-4-7'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    siteUrl: 'https://platform.deepseek.com/api_keys',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'xai',
    name: 'xAI',
    kind: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    siteUrl: 'https://console.x.ai/',
    models: ['grok-3', 'grok-3-mini'],
  },
  {
    id: 'together',
    name: 'Together AI',
    kind: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    siteUrl: 'https://api.together.xyz/settings/api-keys',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    kind: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    siteUrl: 'https://fireworks.ai/account/api-keys',
    models: ['accounts/fireworks/models/llama-v3p3-70b-instruct'],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    kind: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    siteUrl: 'https://www.perplexity.ai/settings/api',
    models: ['sonar', 'sonar-pro'],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    kind: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    siteUrl: 'https://cloud.cerebras.ai/',
    models: ['llama-3.3-70b', 'qwen-3-32b'],
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    kind: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    siteUrl: 'https://platform.moonshot.ai/console/api-keys',
    models: ['kimi-k2.5', 'moonshot-v1-128k'],
  },
]

export const POPULAR_PROVIDER_IDS = PROVIDER_PRESETS.map((p) => p.id)

export function isPopularProvider(id: string) {
  return POPULAR_PROVIDER_IDS.includes(id)
}

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id)
}
