<script setup lang="ts">
const route = useRoute()
await navigateTo(`/settings/desktop/apps/${route.params.id}/logs`, { redirectCode: 302 })
</script>
