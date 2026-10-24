/** Sidecar row on Desktop and Terminal. Env-disabled packs stay off both. */
export function listedSidecarApp(app: { disabled?: boolean }) {
  return app.disabled !== true
}

/** Package row on Desktop and Terminal. Off until enabled. Core stays on. */
export function listedPackageApp(pkg: { enabled?: boolean }) {
  return pkg.enabled !== false
}

/** Process id for a pinned launcher. desktop-gui.sh allows [a-z0-9_-] only. */
export function pinProcessId(id: string): string {
  const slug = id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return `pin-${slug || 'app'}`.slice(0, 48)
}

/** Process id for one package GUI on the shared desktop. */
export function guiAppProxyId(id: string, command = ''): string {
  const cmd = command.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return cmd ? `app-${id}-${cmd}` : `app-${id}`
}
