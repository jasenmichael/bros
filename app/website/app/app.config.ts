import { docsNavItems } from '../../layers/docs/app/utils/docsNav'

export default defineAppConfig({
  bros: {
    navItems: [
      { label: 'Home', to: '/', icon: 'i-lucide-home', exact: true },
      ...docsNavItems(),
    ],
  },
})
