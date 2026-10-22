import { managerByKind } from './managers'

export async function suggestCliPackages(kind: string, query: string): Promise<string[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const manager = managerByKind(kind)
  if (!manager?.suggest) return []
  return manager.suggest(q)
}
