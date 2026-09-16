import { listConversations } from '../../utils/chat'

export default defineEventHandler(() => {
  return { conversations: listConversations() }
})
