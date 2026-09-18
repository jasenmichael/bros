<script setup lang="ts">
useSeoMeta({
  title: 'Bros',
  description: 'Docker-isolated local AI control plane: chat, models, and managed sidecars.',
})

const features = [
  {
    title: 'Getting started',
    to: '/docs/getting-started',
    body: 'Install with Docker only. ./bros --dev on host port 3055.',
  },
  {
    title: 'Sidecars',
    to: '/docs/sidecars',
    body: 'Managed Compose projects on the bros network. Core plus custom under data/sidecars.',
  },
  {
    title: 'Configuration',
    to: '/docs/configuration',
    body: 'Bootstrap YAML is working_dir + data_dir. Everything else lives in SQLite and the UI.',
  },
]
</script>

<template>
  <BrosPageShell
    title="Bros"
    description="Boxed Runtime Orchestration System — a Docker-isolated local AI control plane. Chat, models, and sidecars on one host."
  >
    <div class="space-y-10">
      <div class="flex flex-wrap gap-3">
        <UButton to="/docs/getting-started" color="primary">
          Get started
        </UButton>
        <UButton to="/docs/sidecars" color="neutral" variant="outline">
          Sidecars
        </UButton>
        <UButton to="/docs/configuration" color="neutral" variant="outline">
          Configuration
        </UButton>
      </div>

      <section class="space-y-3">
        <h2 class="text-lg font-semibold text-white">Install</h2>
        <p class="max-w-2xl text-[var(--bros-muted)]">
          Clones
          <a class="text-[var(--bros-accent)] hover:underline" href="https://github.com/jasenmichael/bros">jasenmichael/bros</a>
          into <code class="text-[var(--bros-text)]">~/.bros</code>. Override with
          <code class="text-[var(--bros-text)]">BROS_DIR</code>.
        </p>
        <pre class="overflow-x-auto rounded-lg border border-[var(--bros-border)] bg-[#121820] p-4 text-sm text-[#e8eef5]"><code>curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
cd ~/.bros
./bros --dev</code></pre>
        <p class="text-sm text-[var(--bros-muted)]">
          App:
          <a class="text-[var(--bros-accent)] hover:underline" href="http://127.0.0.1:3055">http://127.0.0.1:3055</a>
        </p>
      </section>

      <section class="grid gap-4 md:grid-cols-3">
        <NuxtLink
          v-for="item in features"
          :key="item.to"
          :to="item.to"
          class="rounded-lg border border-[var(--bros-border)] bg-[#121820] p-4 no-underline transition-colors hover:border-[var(--bros-accent)]"
        >
          <h3 class="font-semibold text-white">{{ item.title }}</h3>
          <p class="mt-2 text-sm text-[var(--bros-muted)]">{{ item.body }}</p>
        </NuxtLink>
      </section>

      <section class="space-y-2 max-w-2xl">
        <h2 class="text-lg font-semibold text-white">Models</h2>
        <p class="text-[var(--bros-muted)]">
          Recommended pulls are official (and verified community) Ollama tags whose on-disk size is
          <strong class="text-white">≤ 16 GB</strong>.
          <code class="text-[var(--bros-text)]">qwen3-coder:14b</code> is not a library tag — use
          <code class="text-[var(--bros-text)]">freehuntx/qwen3-coder:14b</code>
          or
          <code class="text-[var(--bros-text)]">qwen2.5-coder:14b</code>.
          Type any <code class="text-[var(--bros-text)]">name:tag</code> or
          <code class="text-[var(--bros-text)]">owner/name:tag</code>; saved names stay under <strong class="text-white">Yours</strong>.
        </p>
      </section>

      <section class="space-y-2 max-w-2xl">
        <h2 class="text-lg font-semibold text-white">Docs site (this site)</h2>
        <p class="text-[var(--bros-muted)]">
          GitHub Pages at <code class="text-[var(--bros-text)]">/bros/</code>. Local:
        </p>
        <pre class="overflow-x-auto rounded-lg border border-[var(--bros-border)] bg-[#121820] p-4 text-sm text-[#e8eef5]"><code>pnpm docs:dev
# http://127.0.0.1:3056/bros/

pnpm docs:generate
pnpm --filter @bros/website preview</code></pre>
      </section>
    </div>
  </BrosPageShell>
</template>
