/** Per-sidecar in-flight action keys (`id:action` or global keys like `create`). */

export function sidecarBusyKey(id: string, action: string) {
  return `${id}:${action}`
}

export function addSidecarBusy(keys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(keys)
  next.add(key)
  return next
}

export function removeSidecarBusy(keys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(keys)
  next.delete(key)
  return next
}

export function isSidecarBusy(keys: ReadonlySet<string>, id: string, action: string) {
  return keys.has(sidecarBusyKey(id, action))
}

export function isSidecarRowBusy(keys: ReadonlySet<string>, id: string) {
  const prefix = `${id}:`
  for (const key of keys) {
    if (key.startsWith(prefix)) return true
  }
  return false
}
