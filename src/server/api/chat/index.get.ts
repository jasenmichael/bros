import { listConversations } from '../../utils/chat/chat'

export default defineEventHandler(() => {
  return { conversations: listConversations() }
})
