/** Kind shown in parentheses on the app name. */
export type DockerAppKindUi = 'core' | 'addon' | 'custom' | 'repo'

export function dockerAppKindLabel(source: string, kind: string, gitUrl?: string): DockerAppKindUi {
  if (kind === 'core') return 'core'
  if (source === 'custom') return 'custom'
  if (gitUrl || source !== 'shipped') return 'repo'
  if (kind === 'addon') return 'addon'
  return 'custom'
}
