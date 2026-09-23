/** UI source badge. Discover stores shipped, custom, or a git URL. */
export type SidecarSourceUi = 'bros' | 'repo' | 'custom'

export function sidecarSourceLabel(source: string, gitUrl?: string): SidecarSourceUi {
  if (source === 'custom') return 'custom'
  if (gitUrl || source !== 'shipped') return 'repo'
  return 'bros'
}
