<script setup lang="ts">
import ProsePre from '../../layers/theme/app/components/content/ProsePre.vue'

const props = defineProps<{
  text: string
}>()

const source = computed(() => props.text || '')

const components = {
  pre: ProsePre,
  'prose-pre': ProsePre,
  ProsePre,
}
</script>

<template>
  <MDC v-if="source.trim()" :value="source">
    <template #default="{ body }">
      <MDCRenderer
        v-if="body"
        :body="body"
        tag="div"
        class="bros-prose"
        :components="components"
      />
    </template>
  </MDC>
</template>
