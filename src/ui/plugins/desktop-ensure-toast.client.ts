import { splitEnsureCards, takeEnsureCard, type EnsureCard } from '../utils/ensureToast'

const ID = 'desktop-ensure'
const SHOW_MS = 700
const CLOSE_MS = 1600

type EnsureStatus = { running?: boolean; steps?: string[] }

export default defineNuxtPlugin(() => {
  const toast = useToast()
  const waiting: EnsureCard[] = []
  let queued = 0
  let primed = false
  let holding = ''
  const { data, refresh } = useFetch<EnsureStatus>('/api/apps/ensure', {
    key: 'bros-ensure',
    lazy: true,
    server: false,
  })
  const timer = setInterval(() => { void refresh() }, 2000)
  onScopeDispose(() => clearInterval(timer))

  function open() {
    return toast.toasts.value.some((row) => row.id === ID)
  }

  function finish(card: EnsureCard) {
    window.setTimeout(() => {
      toast.update(ID, {
        title: card.then,
        description: card.version || '',
        color: card.error ? 'error' : 'success',
      })
      window.setTimeout(() => toast.remove(ID), CLOSE_MS)
    }, SHOW_MS)
  }

  function showNext() {
    const card = takeEnsureCard(waiting, open())
    if (!card) return
    holding = ''
    toast.add({
      id: ID,
      title: card.show,
      description: card.show === card.then ? card.version : '',
      duration: 0,
      color: card.error ? 'error' : undefined,
    })
    finish(card)
  }

  watch(() => toast.toasts.value.some((row) => row.id === ID), (isOpen) => {
    if (!isOpen) showNext()
  })

  watch(
    () => data.value,
    (status) => {
      if (!status) return
      const steps = status.steps || []
      const { ready, live } = splitEnsureCards(steps)
      if (!primed) {
        primed = true
        if (!status.running) {
          queued = ready.length
          return
        }
      }
      for (const card of ready.slice(queued)) {
        if (holding === card.id && open()) {
          holding = ''
          toast.update(ID, { title: card.show, duration: 0 })
          finish(card)
        } else {
          waiting.push(card)
        }
      }
      queued = ready.length
      if (open()) return
      if (waiting.length) {
        showNext()
        return
      }
      if (live && holding !== live.id) {
        holding = live.id
        toast.add({ id: ID, title: live.show, description: '', duration: 0 })
      }
    },
    { immediate: true },
  )
})
