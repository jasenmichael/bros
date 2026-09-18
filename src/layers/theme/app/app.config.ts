export type { BrosNavItem } from './types/nav'

export default defineAppConfig({
  bros: {
    brand: 'Bros',
    brandTo: '/',
    navItems: [] as BrosNavItem[],
    bottomItems: [] as BrosNavItem[],
    showPinned: false,
    showAfterPrimary: false,
  },
})
