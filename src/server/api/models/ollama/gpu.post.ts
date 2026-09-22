import { sendMoved } from '../../../utils/apiRedirect'

export default defineEventHandler((event) => sendMoved(event, '/api/providers/ollama/gpu', 308))
