<script setup lang="ts">
import type { BrosNavItem } from '../types/nav'
import { navTreeOpenState } from '../utils/navTreeOpen'

const props = withDefaults(defineProps<{
  items: BrosNavItem[]
  depth?: number
  iconMode?: boolean
}>(), {
  depth: 0,
  iconMode: false,
})

const route = useRoute()
const toggled = ref<Record<string, boolean>>({})

function keyOf(item: BrosNavItem, index: number) {
  return item.to || `${props.depth}:${index}:${item.label}`
}

function pathMatches(to: string | undefined, path: string) {
  if (!to) return false
  const clean = path.replace(/\/$/, '') || '/'
  if (clean === to) return true
  if (to === '/') return false
  return clean.startsWith(`${to}/`)
}

function childMatches(item: BrosNavItem, path: string): boolean {
  if (pathMatches(item.to, path)) return true
  return Boolean(item.children?.some((child) => childMatches(child, path)))
}

function firstHref(item: BrosNavItem): string | undefined {
  if (item.to) return item.to
  for (const child of item.children || []) {
    const href = firstHref(child)
    if (href) return href
  }
}

function itemHref(item: BrosNavItem) {
  if (item.to) return item.to
  if (props.iconMode) return firstHref(item)
}

function isOpen(item: BrosNavItem, index: number) {
  if (props.iconMode || !item.children?.length) return false
  const key = keyOf(item, index)
  return navTreeOpenState(toggled.value[key], childMatches(item, route.path))
}

function toggle(item: BrosNavItem, index: number) {
  if (props.iconMode || !item.children?.length) return
  const key = keyOf(item, index)
  toggled.value = { ...toggled.value, [key]: !isOpen(item, index) }
}

function linkActiveClass(item: BrosNavItem) {
  return item.exact ? '' : 'bros-nav-tree__link--active'
}

function linkExactActiveClass(item: BrosNavItem) {
  return item.exact ? 'bros-nav-tree__link--active' : undefined
}
</script>

<template>
  <template v-for="(item, index) in items" :key="keyOf(item, index)">
    <div
      class="bros-nav-tree__row"
      :class="{ 'bros-nav-tree__row--icon': iconMode }"
      :style="iconMode ? undefined : { paddingLeft: `${depth * 0.7}rem` }"
      @click="item.children?.length && toggle(item, index)"
    >
      <NuxtLink
        v-if="itemHref(item)"
        :to="itemHref(item)"
        :target="item.external ? '_blank' : undefined"
        class="bros-nav-tree__link"
        :class="{ 'bros-nav-tree__link--nested': depth > 0 }"
        :active-class="linkActiveClass(item)"
        :exact-active-class="linkExactActiveClass(item)"
        :title="item.label"
      >
        <UIcon v-if="item.icon && depth === 0" :name="item.icon" class="size-4 shrink-0" />
        <span v-if="!iconMode" class="bros-nav-label">{{ item.label }}</span>
      </NuxtLink>
      <button
        v-else-if="!iconMode"
        type="button"
        class="bros-nav-tree__link bros-nav-tree__group"
      >
        <UIcon v-if="item.icon && depth === 0" :name="item.icon" class="size-4 shrink-0" />
        <span class="bros-nav-label">{{ item.label }}</span>
      </button>
      <button
        v-if="!iconMode && item.children?.length"
        type="button"
        class="bros-nav-tree__chevron"
        :aria-label="`${isOpen(item, index) ? 'Collapse' : 'Expand'} ${item.label}`"
        :aria-expanded="isOpen(item, index)"
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5"
          :class="{ 'bros-nav-tree__chevron-icon--open': isOpen(item, index) }"
        />
      </button>
    </div>
    <div v-if="!iconMode && item.children?.length && isOpen(item, index)" class="bros-nav-tree__children">
      <BrosNavTree :items="item.children" :depth="depth + 1" />
    </div>
  </template>
</template>

<style scoped>
.bros-nav-tree__row {
  display: flex;
  align-items: center;
  gap: 0.1rem;
  margin-bottom: 0.1rem;
  min-width: 0;
}

.bros-nav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bros-nav-tree__row--icon {
  justify-content: center;
}

.bros-nav-tree__link {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.55rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: #c5d0dc;
  text-align: left;
  text-decoration: none;
  font-size: 0.925rem;
  cursor: pointer;
}

.bros-nav-tree__link--nested {
  font-size: 0.8125rem;
  padding: 0.32rem 0.5rem;
}

.bros-nav-tree__row--icon .bros-nav-tree__link {
  flex: none;
  min-width: auto;
  justify-content: center;
  padding: 0.55rem 0.35rem;
}

.bros-nav-tree__link:hover {
  background: #1a222c;
  color: #ffffff;
}

.bros-nav-tree__link--active {
  background: #1e2a38;
  color: #ffffff;
  box-shadow: inset 2px 0 0 #3d9cf0;
}

.bros-nav-tree__group {
  font-weight: 550;
  color: #8b9bb0;
}

.bros-nav-tree__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  border: 0;
  border-radius: 0.3rem;
  background: transparent;
  color: #8b9bb0;
  cursor: pointer;
}

.bros-nav-tree__chevron:hover {
  color: #ffffff;
  background: #1a222c;
}

.bros-nav-tree__chevron-icon--open {
  transform: rotate(90deg);
}

.bros-nav-tree__children {
  min-width: 0;
}
</style>
