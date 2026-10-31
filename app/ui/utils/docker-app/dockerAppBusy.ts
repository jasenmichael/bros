/** Per-dockerApp in-flight action keys (`id:action` or global keys like `create`). */

export function dockerAppBusyKey(id: string, action: string) {
  return `${id}:${action}`
}

export function addDockerAppBusy(keys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(keys)
  next.add(key)
  return next
}

export function removeDockerAppBusy(keys: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(keys)
  next.delete(key)
  return next
}

export function isDockerAppBusy(keys: ReadonlySet<string>, id: string, action: string) {
  return keys.has(dockerAppBusyKey(id, action))
}

export function isDockerAppRowBusy(keys: ReadonlySet<string>, id: string) {
  const prefix = `${id}:`
  for (const key of keys) {
    if (key.startsWith(prefix)) return true
  }
  return false
}
