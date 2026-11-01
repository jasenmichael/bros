/** Strip `.md` from docs hrefs so Nuxt Content routes stay extensionless. */
export function docsLinkHref(href: string): string {
  if (!href || /^(https?:|mailto:)/i.test(href)) return href
  const hashIndex = href.indexOf('#')
  const path = hashIndex === -1 ? href : href.slice(0, hashIndex)
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex)
  if (!path.endsWith('.md')) return href
  return `${path.slice(0, -3)}${hash}`
}
