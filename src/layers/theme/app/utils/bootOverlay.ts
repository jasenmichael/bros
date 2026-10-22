export type BootSidecar = {
  id?: string
  name?: string
  autostart?: boolean
  disabled?: boolean
  phase?: string
}

/** Open only while this process's autostart pass is still running. No status yet uses the SSR seed. */
export function bootOverlayVisible(
  status: { booting?: boolean } | null | undefined,
  seeded = false,
): boolean {
  if (!status) return seeded
  return status.booting === true
}
