export type BrosManagedContainerView = {
  id: string
  name: string
  service: string
  project: string
  kind: 'app' | 'docker'
  dockerAppId: string | null
  state: string
  status: string
  running: boolean
  ports: number[]
}

export type BrosServiceGroup = {
  key: string
  title: string
  kind: 'app' | 'docker'
  dockerAppId: string | null
  runningCount: number
  total: number
  containers: BrosManagedContainerView[]
}

export function groupBrosServices(
  containers: BrosManagedContainerView[],
  dockerAppNames: Record<string, string> = {},
): BrosServiceGroup[] {
  const groups: BrosServiceGroup[] = []
  const index = new Map<string, BrosServiceGroup>()
  for (const row of containers) {
    const key = row.kind === 'app' ? 'app' : `docker:${row.dockerAppId || row.project}`
    let group = index.get(key)
    if (!group) {
      group = {
        key,
        title: row.kind === 'app' ? 'App' : (dockerAppNames[row.dockerAppId || ''] || row.dockerAppId || row.project),
        kind: row.kind,
        dockerAppId: row.dockerAppId,
        runningCount: 0,
        total: 0,
        containers: [],
      }
      index.set(key, group)
      groups.push(group)
    }
    group.containers.push(row)
    group.total += 1
    if (row.running) group.runningCount += 1
  }
  return groups
}
