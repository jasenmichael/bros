export type EnsureCard = { id: string; show: string; then: string; error: boolean; version: string }

function label(id: string) {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : id
}

function nameOf(id: string) {
  return id === 'devbox' ? 'Devbox and Nix' : label(id)
}

function parse(step: string) {
  const match = /^(ok|install|fail):([^:]+)(?::([\s\S]*))?$/.exec(step)
  if (!match) return null
  return { phase: match[1], id: match[2], version: match[3] || '' }
}

function found(id: string, version: string, error: boolean): EnsureCard {
  const name = nameOf(id)
  const title = error ? `${name} failed to install` : `${name} found`
  return { id, show: title, then: title, error, version: error ? '' : version }
}

function installing(id: string, result: string, version: string): EnsureCard {
  const name = nameOf(id)
  const error = result === 'fail'
  const then = result === 'ok' ? `${name} found` : error ? `${name} failed to install` : ''
  return { id, show: `Installing ${name}`, then, error, version: result === 'ok' ? version : '' }
}

/** `ok:id:version` is already present. `install:id` is an install in progress. */
export function splitEnsureCards(steps: string[]) {
  const ready: EnsureCard[] = []
  let live: EnsureCard | null = null
  for (let i = 0; i < steps.length; i++) {
    const step = parse(steps[i])
    if (!step) continue
    if (step.phase === 'install') {
      const next = parse(steps[i + 1] || '')
      if (next && (next.phase === 'ok' || next.phase === 'fail') && next.id === step.id) {
        ready.push(installing(step.id, next.phase, next.version))
        if (live?.id === step.id) live = null
        i++
      } else {
        live = installing(step.id, '', '')
      }
    } else if (step.phase === 'ok' || step.phase === 'fail') {
      ready.push(found(step.id, step.version, step.phase === 'fail'))
    }
  }
  return { ready, live }
}

export function takeEnsureCard(waiting: EnsureCard[], busy: boolean) {
  if (busy || !waiting.length) return null
  return waiting.shift() ?? null
}
