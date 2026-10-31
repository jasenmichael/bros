import { docsNavItems } from '../layers/docs/app/utils/docsNav'

export default defineAppConfig({
  bros: {
    navItems: [
      { label: 'Dashboard', to: '/', icon: 'i-lucide-layout-dashboard' },
      { label: 'Desktop', to: '/desktop', icon: 'i-lucide-app-window', exact: true },
      { label: 'Terminal', to: '/terminal', icon: 'i-lucide-terminal', exact: true },
      { label: 'Agents', to: '/agents', icon: 'i-lucide-list-todo', exact: true },
    ],
    bottomItems: [
      { label: 'Docs', to: '/docs', icon: 'i-lucide-book-open', children: docsNavItems() },
      { label: 'Status', to: '/status', icon: 'i-lucide-activity' },
      { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' },
    ],
    showPinned: true,
    showAfterPrimary: true,
    bootOverlay: true,
  },
})
