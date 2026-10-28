import { syncGitCredentials } from '../../utils/agents/desktop'
import { saveSettings, settingsView } from '../../utils/agents/store'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    runtime?: string
    cursorKey?: string
    cursorKeyClear?: boolean
    githubToken?: string
    githubTokenClear?: boolean
    preflightModel?: string
    autoPreflight?: boolean
    autoApprove?: boolean
    autoApprovePr?: boolean
    deleteBranch?: boolean
  }>(event)
  const saved = saveSettings(body || {})
  if (body?.githubTokenClear || body?.githubToken?.trim()) syncGitCredentials(saved.githubToken)
  return settingsView(saved)
})
