import { existsSync } from 'node:fs'
import { createConnection } from 'node:net'

export type HostMode = 'auto' | 'sidecar' | 'host'

export const HOST_MODES: HostMode[] = ['auto', 'sidecar', 'host']

export function isHostMode(v: unknown): v is HostMode {
  return v === 'auto' || v === 'sidecar' || v === 'host'
}

let testInDocker: boolean | undefined

/** Test-only: force in-Docker vs host-Node URL selection. */
export function setAppRunsInDockerForTests(value: boolean | undefined) {
  testInDocker = value
}

/** True when the Nuxt process is the Compose app container, not `pnpm app:dev`. */
export function appRunsInDocker(): boolean {
  if (testInDocker !== undefined) return testInDocker
  return existsSync('/.dockerenv')
}

/** Host as seen from the Bros container (Linux Docker needs host-gateway). */
export function dockerHostName(): string {
  return process.env.BROS_HOST_GATEWAY || 'host.docker.internal'
}

/** Addresses to reach host Ollama. Skip `host.docker.internal` on host Node (Linux DNS hang). */
export function dockerHostCandidates(): string[] {
  if (appRunsInDocker()) {
    return [...new Set([dockerHostName(), 'host.docker.internal', '172.17.0.1'])]
  }
  return [...new Set(['127.0.0.1', '172.17.0.1'])]
}

export function probeTcp(host: string, port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port })
    const done = (ok: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

export async function probeHostPort(port: number): Promise<boolean> {
  for (const host of dockerHostCandidates()) {
    if (await probeTcp(host, port)) return true
  }
  return false
}

export function firstPublishPort(interfaces: Array<{ publish?: number }>): number | undefined {
  return interfaces.map((i) => i.publish).find((p) => typeof p === 'number' && p > 0)
}

/** @deprecated use firstPublishPort */
export const firstHostPort = firstPublishPort

export function hostUiUrl(publish: number): string {
  return `http://127.0.0.1:${publish}/`
}

export type HostRuntime = {
  effectiveMode: 'sidecar' | 'host'
  skipStart: boolean
  warnPortTaken: boolean
  hostManaged: boolean
}

/** Decide start/skip from stored preference + live probe. */
export function resolveHostRuntime(input: {
  hostMode: HostMode
  portOccupied: boolean
  ours: boolean
}): HostRuntime {
  const foreign = input.portOccupied && !input.ours
  if (input.hostMode === 'host') {
    return { effectiveMode: 'host', skipStart: true, warnPortTaken: foreign, hostManaged: true }
  }
  if (input.hostMode === 'sidecar') {
    return { effectiveMode: 'sidecar', skipStart: false, warnPortTaken: foreign, hostManaged: false }
  }
  if (foreign) {
    return { effectiveMode: 'sidecar', skipStart: false, warnPortTaken: true, hostManaged: false }
  }
  return { effectiveMode: 'sidecar', skipStart: false, warnPortTaken: false, hostManaged: false }
}
