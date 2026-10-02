<script setup lang="ts">
const input = defineModel<string>({ required: true })

const toast = typeof useToast === 'function'
  ? useToast()
  : { add: (_opts: Record<string, unknown>) => {} }

const voiceRecording = ref(false)
const voiceBusy = ref(false)

function voiceMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

let voiceRecorder: MediaRecorder | null = null
let voiceChunks: Blob[] = []
let voiceStream: MediaStream | null = null

function stopVoiceTracks() {
  voiceStream?.getTracks().forEach((t) => t.stop())
  voiceStream = null
  voiceRecorder = null
  voiceChunks = []
  voiceRecording.value = false
}

function appendVoiceText(text: string) {
  const t = text.trim()
  if (!t) return
  const cur = input.value
  input.value = cur && !/\s$/.test(cur) ? `${cur} ${t}` : `${cur}${t}`
}

async function startVoice() {
  if (!import.meta.client) return
  if (!window.isSecureContext) {
    toast.add({
      title: 'Microphone needs HTTPS',
      description: 'Voice to text works on localhost or HTTPS (tunnel).',
      color: 'warning',
      icon: 'i-lucide-mic-off',
    })
    return
  }
  try {
    const mime = voiceMime()
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    voiceChunks = []
    voiceRecorder = mime ? new MediaRecorder(voiceStream, { mimeType: mime }) : new MediaRecorder(voiceStream)
    voiceRecorder.ondataavailable = (e) => {
      if (e.data.size) voiceChunks.push(e.data)
    }
    voiceRecorder.start()
    voiceRecording.value = true
  } catch {
    stopVoiceTracks()
    toast.add({
      title: 'Microphone blocked',
      description: 'Allow microphone access to use voice to text.',
      color: 'warning',
      icon: 'i-lucide-mic-off',
    })
  }
}

function stopVoiceRecorder(): Promise<Blob | null> {
  const rec = voiceRecorder
  if (!rec || rec.state === 'inactive') {
    stopVoiceTracks()
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    rec.onstop = () => {
      const type = rec.mimeType || 'audio/webm'
      const blob = voiceChunks.length ? new Blob(voiceChunks, { type }) : null
      stopVoiceTracks()
      resolve(blob)
    }
    rec.stop()
  })
}

async function toggleVoice() {
  if (voiceBusy.value) return
  if (voiceRecording.value) {
    voiceBusy.value = true
    try {
      const blob = await stopVoiceRecorder()
      if (!blob || blob.size === 0) return
      const form = new FormData()
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      form.append('file', blob, `voice.${ext}`)
      const row = await $fetch<{ text?: string }>('/api/chat/transcribe', { method: 'POST', body: form })
      appendVoiceText(row?.text || '')
    } catch (err: unknown) {
      const row = err as { data?: { statusMessage?: string }; statusMessage?: string }
      toast.add({
        title: 'Transcription failed',
        description: row.data?.statusMessage || row.statusMessage || 'Whisper sidecar did not return text.',
        color: 'error',
        icon: 'i-lucide-mic-off',
      })
    } finally {
      voiceBusy.value = false
    }
    return
  }
  await startVoice()
}

onUnmounted(() => {
  if (voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop()
  stopVoiceTracks()
})
</script>

<template>
  <UButton
    type="button"
    icon="i-lucide-mic"
    :aria-label="voiceRecording ? 'Stop recording' : 'Voice to text'"
    :disabled="voiceBusy"
    class="bros-chat-mic"
    :class="{ 'bros-chat-mic--recording': voiceRecording }"
    @click="toggleVoice"
  />
</template>

<style scoped>
.bros-chat-mic {
  border-radius: 999px;
}

.bros-chat-mic--recording {
  animation: bros-mic-pulse 1.1s ease-in-out infinite;
}

@keyframes bros-mic-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--bros-accent) 45%, transparent); }
  50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--bros-accent) 0%, transparent); }
}
</style>
