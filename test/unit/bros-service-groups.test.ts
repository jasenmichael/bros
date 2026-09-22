import { describe, expect, it } from 'vitest'
import { groupBrosServices, type BrosManagedContainerView } from '../../src/app/utils/brosServiceGroups'

function row(partial: Partial<BrosManagedContainerView> & Pick<BrosManagedContainerView, 'id' | 'service' | 'kind'>): BrosManagedContainerView {
  return {
    name: partial.name || partial.service,
    project: partial.project || (partial.kind === 'app' ? 'bros' : `bros-sc-${partial.sidecarId || 'x'}`),
    sidecarId: partial.kind === 'app' ? null : (partial.sidecarId || 'x'),
    state: partial.state || (partial.running === false ? 'exited' : 'running'),
    status: partial.status || 'Up',
    running: partial.running ?? true,
    ports: partial.ports || [],
    ...partial,
  }
}

describe('groupBrosServices', () => {
  it('groups app first then each sidecar pack', () => {
    const groups = groupBrosServices([
      row({ id: 'a', service: 'bros', kind: 'app', ports: [3055] }),
      row({ id: 'o', service: 'ollama', kind: 'sidecar', sidecarId: 'ollama', ports: [11435] }),
      row({ id: 'r', service: 'redis', kind: 'sidecar', sidecarId: 'firecrawl', running: false }),
      row({ id: 'f', service: 'api', kind: 'sidecar', sidecarId: 'firecrawl', ports: [3002], running: false }),
    ], { ollama: 'Ollama', firecrawl: 'Firecrawl' })

    expect(groups.map((g) => g.title)).toEqual(['App', 'Ollama', 'Firecrawl'])
    expect(groups[0].runningCount).toBe(1)
    expect(groups[2].total).toBe(2)
    expect(groups[2].runningCount).toBe(0)
    expect(groups[2].containers.map((c) => c.service)).toEqual(['redis', 'api'])
  })
})
