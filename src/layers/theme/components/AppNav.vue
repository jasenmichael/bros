<script setup lang="ts">
export type NavItem = {
  label: string
  to: string
  icon?: string
}

const props = withDefaults(
  defineProps<{
    brand?: string
    items?: NavItem[]
  }>(),
  {
    brand: 'Bros',
    items: () => [
      { label: 'Home', to: '/' },
      { label: 'Docs', to: '/docs' },
    ],
  },
)
</script>

<template>
  <aside class="bros-nav">
    <div class="bros-brand">{{ brand }}</div>
    <nav>
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="bros-nav-link"
      >
        {{ item.label }}
      </NuxtLink>
    </nav>
  </aside>
</template>

<style scoped>
.bros-nav {
  background: color-mix(in srgb, var(--bros-surface) 90%, black);
  border-right: 1px solid var(--bros-border);
  padding: 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.bros-brand {
  font-family: var(--bros-font-display);
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: 0.02em;
  color: var(--bros-accent-2);
}
.bros-nav-link {
  display: block;
  padding: 0.5rem 0.75rem;
  border-radius: 0.4rem;
  color: var(--bros-muted);
  text-decoration: none;
  margin-bottom: 0.25rem;
}
.bros-nav-link:hover,
.bros-nav-link.router-link-active {
  background: var(--bros-surface);
  color: var(--bros-text);
}
</style>
