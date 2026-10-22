<script setup lang="ts">
useSeoMeta({
  title: 'Dashboard',
  description: 'Bros control plane',
})

type AttentionItem = { id: string; text: string; href: string }

type Summary = {
  viaTunnel?: boolean
  tunnelHost?: string | null
  attention?: AttentionItem[]
  chats?: Array<{
    id: string
    title: string
    modelId: string
    updatedAt: number
  }>
  providers?: {
    ready: number
    items: Array<{ id: string; name: string; chatOn: boolean; detail: string }>
    pulls: Array<{
      providerId: string
      model: string
      phase: 'queued' | 'running'
      percent: number | null
    }>
  }
  sidecars?: {
    running: number
    total: number
    items: Array<{
      id: string
      name: string
      phase: 'starting' | 'running' | 'stopped' | 'error'
      openUrl: string | null
    }>
  }
  tunnel?: {
    running: boolean
    hostname?: string | null
    publicUrl?: string | null
    installed?: boolean
    loggedIn?: boolean
    helperAlive?: boolean
    error?: string | null
  }
}

const { data: summary, refresh } = await useFetch<Summary>('/api/dashboard/summary', {
  key: 'bros-dashboard-summary',
  lazy: true,
  server: false,
  refreshInterval: 5000,
})
</script>

<template>
  <BrosPageShell
    title="Dashboard"
    description="Recent chats, providers on for chat, sidecar state, and the host tunnel."
  >
    <section
      v-if="summary?.attention?.length"
      aria-label="Needs attention"
      class="mb-4 space-y-2"
    >
      <NuxtLink
        v-for="item in summary.attention"
        :key="item.id"
        :to="item.href"
        class="block rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-100"
      >{{ item.text }}</NuxtLink>
    </section>
    <div class="grid items-start gap-4 lg:grid-cols-3">
      <DashboardChats
        class="lg:col-span-2"
        :loading="!summary"
        :chats="summary?.chats"
      />
      <DashboardProviders
        :loading="!summary"
        :providers="summary?.providers"
      />
      <DashboardSidecars
        class="lg:col-span-2"
        :loading="!summary"
        :sidecars="summary?.sidecars"
      />
      <article class="rounded-xl border border-[var(--bros-border)] bg-[var(--bros-surface)]/70 p-5">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-lg font-medium text-white">Tunnel</h2>
          <NuxtLink
            to="/status"
            class="text-sm text-[var(--bros-accent)] underline-offset-2 hover:underline"
          >Status</NuxtLink>
        </div>
        <DashboardTunnel
          :loading="!summary"
          :via-tunnel="summary?.viaTunnel"
          :tunnel-host="summary?.tunnelHost"
          :tunnel="summary?.tunnel"
          @refresh="refresh()"
        />
      </article>
    </div>
  </BrosPageShell>
</template>
