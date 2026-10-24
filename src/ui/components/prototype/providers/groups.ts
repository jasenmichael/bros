export type ModelGroup = {
  name: string
  providers: { id: string; name: string; sizeLabel: string }[]
}

type Source = {
  id: string
  name: string
  models?: Array<{ name: string; size?: number }>
}

export function groupModels(providers: Source[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>()
  for (const p of providers) {
    for (const m of p.models || []) {
      if (m.name === 'bros') continue
      let group = map.get(m.name)
      if (!group) {
        group = { name: m.name, providers: [] }
        map.set(m.name, group)
      }
      if (group.providers.some(row => row.id === p.id)) continue
      group.providers.push({
        id: p.id,
        name: p.name || p.id,
        sizeLabel: m.size ? `${Math.round(m.size / 1e6)} MB` : '',
      })
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}
