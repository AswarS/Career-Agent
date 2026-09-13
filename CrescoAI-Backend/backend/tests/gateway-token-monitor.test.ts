import { describe, expect, test } from 'bun:test'
import {
  analyzeGatewayRequest,
  estimateGatewayTokens,
} from '../src/services/api/gatewayTokenMonitor.js'

describe('gateway token monitor', () => {
  test('attributes final gateway payload without retaining content', () => {
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
    expect(JSON.stringify(breakdown)).not.toContain('system instructions')
    expect(JSON.stringify(breakdown)).not.toContain('profile result')
  })

  test('estimates Chinese and Latin payloads consistently', () => {
    expect(estimateGatewayTokens('测试测试')).toBe(4)
    expect(estimateGatewayTokens('abcdefghijklmnop')).toBe(4)
  })
})
