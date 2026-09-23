import { listAgentConversations } from '../../utils/chat'

export default defineEventHandler(() => {
  return { conversations: listAgentConversations() }
})
