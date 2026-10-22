/**
 * Default the SPA at this origin so axios talks to nginx /v2 (Firecrawl sidecar),
 * not https://api.firecrawl.dev. Cross-port fetches fail in some previews (Network Error).
 */
(function () {
  try {
    localStorage.setItem('firecrawl_base_url', window.location.origin)
  } catch (e) {}
})()
