import { describe, expect, it } from 'vitest'
import {
  ollamaNameFromModelId,
  parseOllamaContextLength,
  usageFromOllamaObject,
} from '../../src/server/utils/chatStats'
import { formatContextLabel, formatMetaStats, splitStreamBody } from '../../src/app/utils/chatMeta'

describe('chat stats parse', () => {
  it('reads Ollama prompt_eval_count and eval_count', () => {
    expect(usageFromOllamaObject({
      message: { content: '' },
      done: true,
      prompt_eval_count: 100,
      eval_count: 28,
    })).toEqual({ promptTokens: 100, completionTokens: 28 })
  })

  it('ignores missing or non-numeric Ollama counts', () => {
    expect(usageFromOllamaObject({ eval_count: 'nope' })).toEqual({})
    expect(usageFromOllamaObject({ prompt_eval_count: -1, eval_count: 4 })).toEqual({ completionTokens: 4 })
  })

  it('parses llama.context_length from /api/show', () => {
    expect(parseOllamaContextLength({
      model_info: { 'llama.context_length': 32768 },
    })).toBe(32768)
  })

  it('falls back to num_ctx and never invents', () => {
    expect(parseOllamaContextLength({
      parameters: 'stop "<|eot|>"\nnum_ctx          8192\n',
    })).toBe(8192)
    expect(parseOllamaContextLength({})).toBeNull()
    expect(parseOllamaContextLength(null)).toBeNull()
  })

  it('strips ollama/ from model ids and skips other providers', () => {
    expect(ollamaNameFromModelId('ollama/freehuntx/qwen3-coder:14b')).toBe('freehuntx/qwen3-coder:14b')
    expect(ollamaNameFromModelId('ollama-host/llama3.2')).toBe('llama3.2')
    expect(ollamaNameFromModelId('openai/gpt-4o')).toBeNull()
    expect(ollamaNameFromModelId('my-proxy/qwen2.5')).toBeNull()
  })
})

describe('chat meta format', () => {
  it('formats duration and summed tokens', () => {
    expect(formatMetaStats({ durationMs: 1400, promptTokens: 100, completionTokens: 28 })).toBe('1.4s · 128 tok')
    expect(formatMetaStats({ durationMs: 1400 })).toBe('1.4s')
    expect(formatMetaStats({})).toBe('')
  })

  it('formats context size without inventing', () => {
    expect(formatContextLabel(8192)).toBe('8k ctx')
    expect(formatContextLabel(32768)).toBe('32k ctx')
    expect(formatContextLabel(null)).toBeNull()
  })

  it('strips the stream stats trailer from assistant text', () => {
    const mark = '\x1eBROS_STATS\x1e'
    const split = splitStreamBody(`hello${mark}${JSON.stringify({ durationMs: 1400, promptTokens: 10, completionTokens: 2 })}`)
    expect(split.text).toBe('hello')
    expect(split.stats).toEqual({ durationMs: 1400, promptTokens: 10, completionTokens: 2 })
  })
})
