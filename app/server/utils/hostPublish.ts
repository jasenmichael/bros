/** Host ports Bros never publishes. */
export const HOST_PORT_SKIP = new Set([3000, 8080])

/** Probes after this many candidates, start fails. Skipped ports do not count. */
export const HOST_PORT_BUMP_TRIES = 100

const FIXED_HOST_PUBLISH = new Set(['ollama', 'whisper'])

export function fixedHostPublish(id: string): boolean {
  return FIXED_HOST_PUBLISH.has(id)
}

/** `${VAR:-port}` in a compose file for this publish port. */
export function composeHostPortEnv(composeYml: string, publish: number): string | undefined {
  const match = composeYml.match(new RegExp(`\\$\\{([A-Z0-9_]+):-\\s*${publish}\\}`))
  return match?.[1]
}

/**
 * Next host port, starting at `start`.
 * ponytail: one live host port per app. A pack with two publish ports needs a map.
 */
export async function chooseHostPort(
  start: number,
  taken: (port: number) => Promise<boolean>,
  tries = HOST_PORT_BUMP_TRIES,
): Promise<number | undefined> {
  let port = start
  let probed = 0
  while (probed < tries && port <= 65535) {
    if (HOST_PORT_SKIP.has(port)) {
      port++
      continue
    }
    probed++
    if (!(await taken(port))) return port
    port++
  }
  return undefined
}
