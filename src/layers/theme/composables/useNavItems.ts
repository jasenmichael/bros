export type NavItem = {
  label: string
  to: string
  icon?: string
}

export function useNavItems() {
  return useState<NavItem[]>('bros-nav-items', () => [
    { label: 'Home', to: '/' },
    { label: 'Docs', to: '/docs' },
  ])
}
