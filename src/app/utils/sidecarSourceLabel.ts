/** UI source badge. Discover still stores shipped / data dir / git URL. */
export type SidecarSourceUi = 'bros' | 'repo' | 'custom'

export function sidecarSourceLabel(source: string, gitUrl?: string): SidecarSourceUi {
  if (gitUrl || (source !== 'shipped' && source !== 'data dir')) return 'repo'
  if (source === 'data dir') return 'custom'
  return 'bros'
}
