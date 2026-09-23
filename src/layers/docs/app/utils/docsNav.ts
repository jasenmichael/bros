export type DocsNavNode = {
  label: string
  to?: string
  icon?: string
  exact?: boolean
  body?: string
  children?: DocsNavNode[]
}

const PROVIDER_PAGES: DocsNavNode[] = [
  { label: 'Google Gemini', to: '/docs/providers/gemini', body: 'AI Studio key, OpenAI-compat.' },
  { label: 'Groq', to: '/docs/providers/groq', body: 'Free plan, rate-limited.' },
  { label: 'OpenRouter', to: '/docs/providers/openrouter', body: ':free slugs plus paid catalog.' },
  { label: 'Mistral AI', to: '/docs/providers/mistral', body: 'Free mode plus credits.' },
  { label: 'Cohere', to: '/docs/providers/cohere', body: 'Trial key, compat endpoint.' },
  { label: 'OpenAI', to: '/docs/providers/openai', body: 'Chat Completions, paid.' },
  { label: 'Anthropic', to: '/docs/providers/anthropic', body: 'Claude OpenAI-compat layer.' },
  { label: 'DeepSeek', to: '/docs/providers/deepseek', body: 'Cheap; reasoner uses reasoning_content.' },
  { label: 'xAI', to: '/docs/providers/xai', body: 'Grok, paid.' },
  { label: 'Together AI', to: '/docs/providers/together', body: 'Trial credit ended.' },
  { label: 'Fireworks AI', to: '/docs/providers/fireworks', body: 'One-time trial only.' },
  { label: 'Perplexity', to: '/docs/providers/perplexity', body: 'Sonar, paid.' },
]

/** Directory tree of every docs page. Shared by dock, website nav, index, breadcrumbs. */
export const DOCS_NAV_TREE: DocsNavNode[] = [
  {
    label: 'Start',
    icon: 'i-lucide-rocket',
    children: [
      { label: 'Getting started', to: '/docs/getting-started', body: 'bros, port 3055, BROS_HOME.' },
      { label: 'Install', to: '/docs/install', body: 'install.sh, clone, first start, CLI.' },
      { label: 'Environment', to: '/docs/environment', body: 'Full BROS_* catalog.' },
      { label: 'Configuration', to: '/docs/configuration', body: 'Bootstrap YAML and SQLite.' },
    ],
  },
  {
    label: 'App',
    to: '/docs/app',
    icon: 'i-lucide-layout-dashboard',
    body: 'Dashboard, dock, login, Docs.',
    children: [
      { label: 'Chat', to: '/docs/chat', body: 'Provider then model, Stop, mic, auto-title.' },
      { label: 'Agent', to: '/docs/agent', body: 'Web search and scrape through Firecrawl.' },
      {
        label: 'Models',
        to: '/docs/models',
        body: 'Ollama, Popular services, Custom.',
        children: [
          { label: 'Ollama', to: '/docs/models-ollama', body: 'Pull menu, GPU, Yours.' },
          { label: 'Custom providers', to: '/docs/models-custom', body: 'Add custom, slug rules, paste-ins.' },
        ],
      },
      {
        label: 'Providers',
        children: [
          { label: 'Ollama', to: '/docs/providers/ollama', body: 'Sidecar and host Ollama.' },
          { label: 'Custom providers', to: '/docs/providers/custom', body: 'Add custom, slug rules.' },
        ],
      },
      { label: 'Status', to: '/docs/status', body: 'App, Docker, disk, GPU, tunnel, sidecars.' },
      { label: 'Settings', to: '/docs/settings', body: 'Paths and passkey file.' },
      { label: 'Tunnel', to: '/docs/tunnel', body: 'Host cloudflared, install, login.' },
    ],
  },
  {
    label: 'Sidecars',
    to: '/docs/sidecars',
    icon: 'i-lucide-container',
    body: 'sidecar.yml, Compose, network bros.',
    children: [
      { label: 'Ollama', to: '/docs/sidecars/ollama', body: 'Publish 11435, host provider, bros model.' },
      { label: 'OpenCode', to: '/docs/sidecars/opencode', body: 'Publish 4097, LAN / until upstream base-path.' },
      { label: 'Open WebUI', to: '/docs/sidecars/openwebui', body: 'Publish 3080, never 3000/8080.' },
      { label: 'Firecrawl', to: '/docs/sidecars/firecrawl', body: 'Publish 3002, scrape API; UI is Firecrawl UI.' },
      { label: 'Firecrawl UI', to: '/docs/sidecars/firecrawl-ui', body: 'Publish 3081, scrape UI, never 3000/8080.' },
      { label: 'Whisper', to: '/docs/sidecars/whisper', body: 'Publish 8090, chat voice to text.' },
      { label: 'Custom', to: '/docs/sidecars/custom', body: 'Drop-in under data/sidecars.' },
    ],
  },
  {
    label: 'Popular services',
    to: '/docs/providers',
    icon: 'i-lucide-cloud',
    body: 'Twelve OpenAI-compat cloud cards.',
    children: PROVIDER_PAGES,
  },
  {
    label: 'Contribute',
    icon: 'i-lucide-code',
    children: [
      { label: 'Development', to: '/docs/development', body: 'pnpm dev bind-mount, tests.' },
      { label: 'Docs site', to: '/docs/website', body: 'Pages /bros/, same docs/.' },
    ],
  },
  {
    label: 'API',
    to: '/docs/api',
    icon: 'i-lucide-braces',
    body: 'HTTP API, OpenAPI 3.1.',
  },
]

export function docsNavHrefs(nodes: DocsNavNode[] = DOCS_NAV_TREE): string[] {
  const out: string[] = []
  const walk = (list: DocsNavNode[]) => {
    for (const node of list) {
      if (node.to) out.push(node.to)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

export function docsNavLeaves(node: DocsNavNode): DocsNavNode[] {
  const out: DocsNavNode[] = []
  if (node.to) out.push(node)
  for (const child of node.children || []) out.push(...docsNavLeaves(child))
  return out
}

export type DocsCrumb = { label: string; to?: string }

export function docsIndexGroups(nodes: DocsNavNode[] = DOCS_NAV_TREE) {
  return nodes.map((group) => ({
    title: group.label,
    pages: docsNavLeaves(group)
      .filter((node) => node.to)
      .map((node) => ({
        title: node.label,
        to: node.to as string,
        body: node.body || '',
      })),
  }))
}

export function docsNavItems(nodes: DocsNavNode[] = DOCS_NAV_TREE) {
  return nodes.map((node) => ({
    label: node.label,
    to: node.to,
    icon: node.icon,
    exact: node.exact,
    children: node.children?.length ? docsNavItems(node.children) : undefined,
  }))
}

export function docsBreadcrumbs(path: string): DocsCrumb[] {
  const clean = path.replace(/\/$/, '') || '/docs'
  const crumbs: DocsCrumb[] = [{ label: 'Docs', to: '/docs' }]
  if (clean === '/docs') return crumbs

  const chain: DocsNavNode[] = []
  const find = (nodes: DocsNavNode[]): boolean => {
    for (const node of nodes) {
      chain.push(node)
      if (node.to === clean) return true
      if (node.children?.length && find(node.children)) return true
      chain.pop()
    }
    return false
  }
  if (!find(DOCS_NAV_TREE)) {
    const slug = clean.split('/').filter(Boolean).pop() || 'Docs'
    crumbs.push({ label: slug, to: clean })
    return crumbs
  }
  for (const node of chain) {
    crumbs.push({ label: node.label, to: node.to })
  }
  return crumbs
}

export function nodeMatchesPath(node: DocsNavNode, path: string): boolean {
  const clean = path.replace(/\/$/, '') || '/'
  if (node.to && (clean === node.to || (node.to !== '/docs' && clean.startsWith(`${node.to}/`)))) return true
  return Boolean(node.children?.some((child) => nodeMatchesPath(child, path)))
}
