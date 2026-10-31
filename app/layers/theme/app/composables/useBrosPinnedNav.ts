export function useBrosPinnedNav() {
  const pinnedItems = computed(() => [] as Array<{
    label: string
    to: string
    icon?: string
    external?: boolean
  }>)
  return { pinnedItems }
}
