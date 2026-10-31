<script setup lang="ts">
const props = defineProps<{ icon?: string, name: string }>()
const broken = ref(false)
const src = computed(() => props.icon && !broken.value ? `/api/desktop/icons?name=${encodeURIComponent(props.icon)}` : '')
// Cursor pixmap is a dark plate. On a dark tile only the cube shows, about half the box.
const cursor = computed(() => props.icon === 'co.anysphere.cursor')
watch(() => props.icon, () => { broken.value = false })
</script>

<template>
  <span class="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden">
    <img v-if="src" :src="src" alt="" class="size-8 object-contain" :class="cursor ? 'scale-[1.6]' : ''" @error="broken = true">
    <span v-else class="text-sm text-[var(--bros-muted)]">{{ name.slice(0, 1) || '?' }}</span>
  </span>
</template>
