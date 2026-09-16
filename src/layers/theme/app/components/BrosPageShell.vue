<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
}>(), {
  title: '',
  description: ''
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <div v-if="title" class="mb-8">
      <h1 class="text-3xl font-semibold tracking-tight text-white">{{ title }}</h1>
      <p v-if="description" class="mt-2 max-w-2xl text-[var(--bros-muted)]">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
