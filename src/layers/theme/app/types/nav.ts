export type BrosNavItem = {
  label: string
  to?: string
  icon?: string
  external?: boolean
  exact?: boolean
  children?: BrosNavItem[]
}
