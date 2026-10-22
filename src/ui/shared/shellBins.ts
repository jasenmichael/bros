/** Never PATH-wrap a shell. That replaces the host session with the container. */
const SHELL_BINS = new Set(['bash', 'sh', 'dash', 'zsh', 'fish', 'rbash'])

export function isShellBin(bin: string): boolean {
  return SHELL_BINS.has(bin)
}
