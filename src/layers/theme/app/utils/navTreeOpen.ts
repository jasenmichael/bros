export function navTreeOpenState(forced: boolean | undefined, routeMatch: boolean) {
  if (forced !== undefined) return forced
  return routeMatch
}
