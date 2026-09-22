<script setup lang="ts">
useSeoMeta({
  title: 'Bros',
  description: 'Docker-isolated local AI control plane: chat, providers, and managed sidecars.',
})

const features = [
  {
    title: 'Chat',
    to: '/docs/chat',
    body: 'Provider then model. Sidecar, host, Popular services, then custom. Stop aborts the stream.',
  },
  {
    title: 'Providers',
    to: '/docs/providers',
    body: 'Ollama locally. Popular services take a user API key. Custom is any OpenAI-compat base URL.',
  },
  {
    title: 'Sidecars',
    to: '/docs/sidecars',
    body: 'Core Ollama, then addon sidecars from shipped packs, a git clone, or the data dir.',
  },
  {
    title: 'Development',
    to: '/docs/development',
    body: 'pnpm dev bind-mount for contributors. User CLI stays bros.',
  },
]
</script>

<template>
  <BrosPageShell
    title="Bros"
    description="Boxed Runtime Orchestration System — a Docker-isolated local AI control plane. Chat, providers, and sidecars on one host."
  >
    <div class="space-y-10">
      <div class="flex flex-wrap gap-3">
        <UButton to="/docs/getting-started" color="primary">
          Get started
        </UButton>
        <UButton to="/docs/providers" color="neutral" variant="outline">
          Providers
        </UButton>
        <UButton to="/docs/sidecars" color="neutral" variant="outline">
          Sidecars
        </UButton>
      </div>

      <section class="space-y-3">
        <h2 class="text-lg font-semibold text-white">Install</h2>
        <p class="max-w-2xl text-[var(--bros-muted)]">
          Clones
          <a class="text-[var(--bros-accent)] hover:underline" href="https://github.com/jasenmichael/bros">jasenmichael/bros</a>
          into <code class="text-[var(--bros-text)]">~/.bros</code>. Override with
          <code class="text-[var(--bros-text)]">BROS_HOME</code>.
        </p>
        <pre class="overflow-x-auto rounded-lg border border-[var(--bros-border)] bg-[#121820] p-4 text-sm text-[#e8eef5]"><code>curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
bros</code></pre>
        <p class="text-sm text-[var(--bros-muted)]">
          App:
          <a class="text-[var(--bros-accent)] hover:underline" href="http://127.0.0.1:3055">http://127.0.0.1:3055</a>
        </p>
      </section>

      <section class="grid gap-4 md:grid-cols-2">
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
        <h2 class="text-lg font-semibold text-white">Providers</h2>
        <p class="text-[var(--bros-muted)]">
          Providers has three sections: <strong class="text-white">Ollama</strong> (sidecar + host),
          <strong class="text-white">Popular services</strong> (twelve OpenAI-compat clouds — paste a key),
          and <strong class="text-white">Custom providers</strong>.
          Ollama recommended pulls are official (and verified community) tags
          <strong class="text-white">≤ 16 GB</strong>.
          See
          <NuxtLink to="/docs/providers" class="text-[var(--bros-accent)] hover:underline">Providers</NuxtLink>
          and
          <NuxtLink to="/docs/providers/custom" class="text-[var(--bros-accent)] hover:underline">Custom</NuxtLink>.
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
