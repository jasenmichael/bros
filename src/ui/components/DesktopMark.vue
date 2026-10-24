<script setup lang="ts">
const props = defineProps<{ icon?: string, name: string }>()
const broken = ref(false)
const src = computed(() => props.icon && !broken.value ? `/api/desktop/icons?name=${encodeURIComponent(props.icon)}` : '')
watch(() => props.icon, () => { broken.value = false })
</script>

<template>
  <img v-if="src" :src="src" alt="" class="size-8 object-contain" @error="broken = true">
  <span v-else class="text-sm text-[var(--bros-muted)]">{{ name.slice(0, 1) || '?' }}</span>
</template>
