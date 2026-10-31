<script setup lang="ts">
const route = useRoute()
await navigateTo(`/apps/${route.params.id}/logs`, { redirectCode: 302 })
</script>
