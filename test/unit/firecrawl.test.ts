import { afterEach, describe, expect, it } from 'vitest'
import { setAppRunsInDockerForTests } from '../../src/server/utils/hostProbe'
import {
  canonicalUrl,
  firecrawlBaseUrl,
  parseScrapeMarkdown,
  parseSearchHits,
  scrapeAllowed,
} from '../../src/server/utils/firecrawl'

describe('firecrawlBaseUrl', () => {
  afterEach(() => {
    setAppRunsInDockerForTests(undefined)
    delete process.env.BROS_FIRECRAWL_PORT
  })

  it('uses Docker DNS in the compose app', () => {
    setAppRunsInDockerForTests(true)
    expect(firecrawlBaseUrl({ BROS_FIRECRAWL_PORT: '19999' })).toBe('http://firecrawl:3002')
  })

  it('uses the host publish port on host Node', () => {
    setAppRunsInDockerForTests(false)
    expect(firecrawlBaseUrl({})).toBe('http://127.0.0.1:3002')
    expect(firecrawlBaseUrl({ BROS_FIRECRAWL_PORT: '3010' })).toBe('http://127.0.0.1:3010')
  })
})

describe('parseSearchHits', () => {
  it('reads v2 web results and drops private urls', () => {
    const hits = parseSearchHits({
      success: true,
      data: {
        web: [
          { url: 'https://example.com/a', title: 'A', description: 'alpha' },
          { url: 'http://127.0.0.1:3055/', title: 'Local', description: 'nope' },
          { url: 'https://example.com/a/', title: 'Dup', description: 'again' },
        ],
      },
    })
    expect(hits).toEqual([{ title: 'A', url: 'https://example.com/a', snippet: 'alpha' }])
  })

  it('reads a bare data array', () => {
    const hits = parseSearchHits({
      data: [{ link: 'https://example.com/b', title: 'B', snippet: 'beta' }],
    })
    expect(hits).toEqual([{ title: 'B', url: 'https://example.com/b', snippet: 'beta' }])
  })
})

describe('parseScrapeMarkdown', () => {
  it('caps long pages', () => {
    const markdown = parseScrapeMarkdown({ data: { markdown: 'x'.repeat(12_050) } })
    expect(markdown.endsWith('[truncated]')).toBe(true)
    expect(markdown.length).toBeLessThan(12_080)
  })
})

describe('scrapeAllowed', () => {
  const allowed = new Set([canonicalUrl('https://example.com/a')!])

  it('allows a search hit', () => {
    expect(scrapeAllowed('https://example.com/a/', allowed).ok).toBe(true)
  })

  it('refuses a url that was not in this turn’s search', () => {
    const gate = scrapeAllowed('https://evil.example/secret', allowed)
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toContain('search results')
  })

  it('refuses a private host even if it was returned', () => {
    const local = new Set([canonicalUrl('http://127.0.0.1/admin')!])
    const gate = scrapeAllowed('http://127.0.0.1/admin', local)
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.reason).toContain('private')
  })
})
