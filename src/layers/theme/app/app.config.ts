export type BrosNavItem = {
  label: string
  to: string
  icon?: string
  external?: boolean
  exact?: boolean
}

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
