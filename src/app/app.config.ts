export default defineAppConfig({
  bros: {
    navItems: [
      { label: 'Dashboard', to: '/', icon: 'i-lucide-layout-dashboard' },
      { label: 'New chat', to: '/chat', icon: 'i-lucide-message-square', exact: true },
      { label: 'Models', to: '/models', icon: 'i-lucide-cpu' },
      { label: 'Sidecars', to: '/sidecars', icon: 'i-lucide-container' },
      { label: 'Status', to: '/status', icon: 'i-lucide-activity' },
    ],
    bottomItems: [
      { label: 'Docs', to: '/docs', icon: 'i-lucide-book-open' },
      { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' },
    ],
    showPinned: true,
    showAfterPrimary: true,
  },
})
