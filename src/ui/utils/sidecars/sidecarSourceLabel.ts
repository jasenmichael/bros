/** Kind shown in parentheses on the sidecar name. */
export type SidecarKindUi = 'core' | 'addon' | 'custom' | 'repo'

export function sidecarKindLabel(source: string, kind: string, gitUrl?: string): SidecarKindUi {
  if (source === 'custom') return 'custom'
  if (gitUrl || source !== 'shipped') return 'repo'
  if (kind === 'addon') return 'addon'
  return 'core'
}
