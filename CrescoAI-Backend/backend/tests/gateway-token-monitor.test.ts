import { describe, expect, test } from 'bun:test'
import {
  analyzeGatewayRequest,
  estimateGatewayTokens,
  normalizeGatewayUsage,
} from '../src/services/api/gatewayTokenMonitor.js'

describe('gateway token monitor', () => {
  test('attributes payload and retains bounded trajectory previews for manual review', () => {
    const breakdown = analyzeGatewayRequest({
      model: 'GLM-test',
      messages: [
        { role: 'system', content: 'system instructions' },
        { role: 'user', content: '生成简历' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'profile_read', arguments: '{"source":"product"}' },
          }],
        },
        { role: 'tool', tool_call_id: 'call-1', content: 'profile result' },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'profile_read',
          description: 'Read profile',
          parameters: { type: 'object', properties: {} },
        },
      }],
    })

    expect(breakdown.systemTokens).toBeGreaterThan(0)
    expect(breakdown.toolDefinitionTokens).toBeGreaterThan(0)
    expect(breakdown.userMessageTokens).toBeGreaterThan(0)
    expect(breakdown.assistantToolCallTokens).toBeGreaterThan(0)
    expect(breakdown.toolResultTokens).toBeGreaterThan(0)
    expect(breakdown.messages.find((message) => message.role === 'tool')?.toolName).toBe('profile_read')
    expect(breakdown.trajectory.map((entry) => entry.contentPreview)).toContain('system instructions')
    expect(breakdown.trajectory.find((entry) => entry.role === 'tool')).toMatchObject({
      toolName: 'profile_read',
      contentPreview: 'profile result',
    })
    expect(breakdown.trajectory.find((entry) => entry.role === 'assistant')?.toolCalls?.[0])
      .toMatchObject({ name: 'profile_read', argumentsPreview: '{"source":"product"}' })
  })

  test('truncates large trajectory content', () => {
    const breakdown = analyzeGatewayRequest({
      messages: [{ role: 'user', content: 'x'.repeat(5_000) }],
    })

    expect(breakdown.trajectory[0]?.contentPreview?.length).toBeLessThan(5_000)
    expect(breakdown.trajectory[0]?.contentPreview?.endsWith('…')).toBe(true)
  })

  test('estimates Chinese and Latin payloads consistently', () => {
    expect(estimateGatewayTokens('测试测试')).toBe(4)
    expect(estimateGatewayTokens('abcdefghijklmnop')).toBe(4)
  })

  test('normalizes both OpenAI and input/output usage names', () => {
    expect(normalizeGatewayUsage({ prompt_tokens: 120, completion_tokens: 8 }))
      .toMatchObject({ prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 })
    expect(normalizeGatewayUsage({ input_tokens: 90, output_tokens: 6 }))
      .toMatchObject({ prompt_tokens: 90, completion_tokens: 6, total_tokens: 96 })
  })
})
