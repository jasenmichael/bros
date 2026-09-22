import { describe, expect, it } from 'vitest'
import {
  filterEnabledOllamaNames,
  isOllamaModelChatEnabled,
  nextDisabledOllamaModels,
  parseDisabledOllamaModels,
} from '../../src/app/utils/ollamaDisabledModels'

describe('ollama disabledModels helpers', () => {
  it('defaults every name on when config is missing or invalid', () => {
    expect(parseDisabledOllamaModels(undefined)).toEqual([])
    expect(parseDisabledOllamaModels({})).toEqual([])
    expect(parseDisabledOllamaModels({ disabledModels: 'llama3.2' })).toEqual([])
    expect(isOllamaModelChatEnabled('llama3.2', [])).toBe(true)
    expect(filterEnabledOllamaNames(['llama3.2', 'mistral'], [])).toEqual(['llama3.2', 'mistral'])
  })

  it('hides only stored names and trims duplicates', () => {
    expect(parseDisabledOllamaModels({ disabledModels: [' mistral ', 'mistral', '', 1] })).toEqual(['mistral'])
    expect(isOllamaModelChatEnabled('mistral', ['mistral'])).toBe(false)
    expect(isOllamaModelChatEnabled('llama3.2', ['mistral'])).toBe(true)
    expect(filterEnabledOllamaNames(['llama3.2', 'mistral'], ['mistral'])).toEqual(['llama3.2'])
  })

  it('toggles one name without touching others', () => {
    expect(nextDisabledOllamaModels([], 'mistral', false)).toEqual(['mistral'])
    expect(nextDisabledOllamaModels(['mistral', 'qwen'], 'mistral', true)).toEqual(['qwen'])
    expect(nextDisabledOllamaModels(['mistral'], 'qwen', false)).toEqual(['mistral', 'qwen'])
  })
})
