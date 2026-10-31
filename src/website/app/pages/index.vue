<script setup lang="ts">
useSeoMeta({
  title: 'Bros',
  description: 'Docker-isolated local AI control plane: chat, providers, apps, and a desktop in the browser.',
})

const features = [
  {
    title: 'Chat',
    to: '/docs/chat',
    body: 'Provider then model. Stop aborts the stream. Mic uses Whisper when enabled.',
  },
  {
    title: 'Providers',
    to: '/docs/providers',
    body: 'Ollama locally. Popular services take a key. Custom is any OpenAI-compat base URL.',
  },
  {
    title: 'Apps',
    to: '/docs/apps',
    body: 'Package installs and docker apps on one store page.',
  },
  {
    title: 'Desktop',
    to: '/docs/desktop',
    body: 'One Wayland session in the browser at /desktop.',
  },
  {
    title: 'Agents',
    to: '/docs/agents',
    body: 'Job board over Workspace repos. Preflight, implement, PR gate.',
  },
  {
    title: 'Development',
    to: '/docs/development',
    body: 'Checkout build and BROS_DEV=1 hot-reload for contributors.',
  },
]
</script>

<template>
  <BrosPageShell
    title="Bros"
    description="Boxed Runtime Orchestration System — a Docker-isolated local AI control plane. Chat, providers, apps, and a desktop in the browser."
  >
    <div class="space-y-10">
      <div class="flex flex-wrap gap-3">
        <UButton to="/docs/getting-started" color="primary">
          Get started
        </UButton>
        <UButton to="/docs/install" color="neutral" variant="outline">
          Install
        </UButton>
        <UButton to="/docs/development" color="neutral" variant="outline">
          Development
        </UButton>
      </div>

      <section class="space-y-3">
        <h2 class="text-lg font-semibold text-white">
          Install
        </h2>
        <p class="max-w-2xl text-[var(--bros-muted)]">
          Needs Docker. Full details:
          <NuxtLink to="/docs/install" class="text-[var(--bros-accent)] hover:underline">Install</NuxtLink>.
          Contributors:
          <NuxtLink to="/docs/development" class="text-[var(--bros-accent)] hover:underline">Development</NuxtLink>.
        </p>
        <pre class="overflow-x-auto rounded-lg border border-[var(--bros-border)] bg-[#121820] p-4 text-sm text-[#e8eef5]"><code>curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash
bros</code></pre>
        <p class="text-sm text-[var(--bros-muted)]">
          App:
          <a class="text-[var(--bros-accent)] hover:underline" href="http://127.0.0.1:3055">http://127.0.0.1:3055</a>
        </p>
      </section>

      <section class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="item in features"
          :key="item.to"
          :to="item.to"
          class="rounded-lg border border-[var(--bros-border)] bg-[#121820] p-4 no-underline transition-colors hover:border-[var(--bros-accent)]"
        >
          <h3 class="font-semibold text-white">
            {{ item.title }}
          </h3>
          <p class="mt-2 text-sm text-[var(--bros-muted)]">
            {{ item.body }}
          </p>
        </NuxtLink>
      </section>
    </div>
  </BrosPageShell>
</template>
