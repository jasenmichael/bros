<script setup lang="ts">
import { docsBreadcrumbs } from '../utils/docsNav'

const route = useRoute()
const crumbs = computed(() => docsBreadcrumbs(route.path))
</script>

<template>
  <nav v-if="crumbs.length" class="bros-docs-crumbs" aria-label="Breadcrumb">
    <ol class="bros-docs-crumbs__list">
      <li v-for="(crumb, i) in crumbs" :key="`${crumb.label}:${crumb.to || i}`" class="bros-docs-crumbs__item">
        <span v-if="i > 0" class="bros-docs-crumbs__sep" aria-hidden="true">/</span>
        <span v-if="i === crumbs.length - 1" class="bros-docs-crumbs__current" aria-current="page">{{ crumb.label }}</span>
        <NuxtLink v-else-if="crumb.to" :to="crumb.to" class="bros-docs-crumbs__link">{{ crumb.label }}</NuxtLink>
        <span v-else class="bros-docs-crumbs__plain">{{ crumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.bros-docs-crumbs {
  margin-bottom: 1rem;
}

.bros-docs-crumbs__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
  color: var(--bros-muted);
}

.bros-docs-crumbs__item {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.bros-docs-crumbs__sep {
  margin-right: 0.15rem;
  color: #5b6b7c;
}

.bros-docs-crumbs__link {
  color: var(--bros-accent);
  text-decoration: none;
}

.bros-docs-crumbs__link:hover {
  text-decoration: underline;
}

.bros-docs-crumbs__plain,
.bros-docs-crumbs__current {
  color: var(--bros-text);
}
</style>
