import { syncGitCredentials } from '../utils/agents/desktop'
import { startAgentLoop } from '../utils/agents/loop'
import { seedGithubTokenFromEnv } from '../utils/agents/store'

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  syncGitCredentials(seedGithubTokenFromEnv())
  startAgentLoop()
})
