/** Open only after user toggle. Route match does not auto-expand. */
export function navTreeOpenState(forced: boolean | undefined, _routeMatch?: boolean) {
  return forced === true
}
