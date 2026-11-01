import { describe, expect, it } from 'vitest'
import { docsLinkHref } from '../../app/layers/docs/app/utils/docsLinkHref'

describe('docsLinkHref', () => {
  it('strips .md from docs paths', () => {
    expect(docsLinkHref('/docs/x.md')).toBe('/docs/x')
  })

  it('preserves hash after stripping .md', () => {
    expect(docsLinkHref('/docs/tunnel.md#docker-app-uis')).toBe('/docs/tunnel#docker-app-uis')
  })

  it('leaves external https links unchanged', () => {
    expect(docsLinkHref('https://example.com/STACK.md')).toBe('https://example.com/STACK.md')
  })

  it('no-ops when path has no .md', () => {
    expect(docsLinkHref('/docs/x')).toBe('/docs/x')
  })
})
