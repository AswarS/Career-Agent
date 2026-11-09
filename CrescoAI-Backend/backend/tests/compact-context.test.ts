import { describe, expect, test } from 'bun:test'
import { compactToolDescription, isCompactContextEnabled } from '../src/constants/compactContext.js'
import { getSystemPrompt } from '../src/constants/prompts.js'
import { toolToAPISchema } from '../src/utils/api.js'
import { BashTool } from '../src/tools/BashTool/BashTool.js'
import { getEmptyToolPermissionContext } from '../src/Tool.js'

describe('opt-in compact context', () => {
  test('retains dynamic context and safety guidance while shortening the static prompt', async () => {
    const oldMode = process.env.CAREER_AGENT_CONTEXT_MODE
    const oldKey = process.env.ANTHROPIC_API_KEY
    const oldSimple = process.env.CLAUDE_CODE_SIMPLE
    process.env.ANTHROPIC_API_KEY = 'test-prompt-assembly-only'
    process.env.CLAUDE_CODE_SIMPLE = '0'
    try {
      process.env.CAREER_AGENT_CONTEXT_MODE = 'full'
      const full = await getSystemPrompt([BashTool], 'GLM-5.2')
      process.env.CAREER_AGENT_CONTEXT_MODE = 'compact'
      const compact = await getSystemPrompt([BashTool], 'GLM-5.2')
      expect(isCompactContextEnabled()).toBe(true)
      expect(compact.join('\n').length).toBeLessThan(full.join('\n').length)
      for (const section of full.filter(s => /^(# (Session-specific guidance|auto memory|Environment|Language|Output Style)|Additional working directories:)/.test(s))) {
        expect(compact).toContain(section)
      }
      expect(compact.join('\n')).toContain('insufficient_input')
      expect(compact.join('\n')).toContain('Confirm hard-to-reverse')
      expect(compact.join('\n')).toContain('Refuse requests for destructive techniques')
    } finally {
      for (const [key, value] of [['CAREER_AGENT_CONTEXT_MODE', oldMode], ['ANTHROPIC_API_KEY', oldKey], ['CLAUDE_CODE_SIMPLE', oldSimple]]) {
        if (value === undefined) delete process.env[key!]
        else process.env[key!] = value
      }
    }
  })

  test('API schemas retain all parameter constraints and separate full/compact caches', async () => {
    const oldMode = process.env.CAREER_AGENT_CONTEXT_MODE
    const oldKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'test-schema-assembly-only'
    const options = { tools: [BashTool], agents: [], model: 'GLM-5.2', getToolPermissionContext: async () => getEmptyToolPermissionContext() }
    try {
      process.env.CAREER_AGENT_CONTEXT_MODE = 'full'
      const full = await toolToAPISchema(BashTool, options) as any
      process.env.CAREER_AGENT_CONTEXT_MODE = 'compact'
      const compact = await toolToAPISchema(BashTool, options) as any
      expect(compact.input_schema).toEqual(full.input_schema)
      expect(compact.name).toBe(full.name)
      expect(compact.description.length).toBeLessThan(full.description.length)
      expect(compact.description).toContain('never change git config')
      expect(compact.description).toContain('Never force-push main/master')
      process.env.CAREER_AGENT_CONTEXT_MODE = 'full'
      const restored = await toolToAPISchema(BashTool, options) as any
      expect(restored.description).toBe(full.description)
    } finally {
      if (oldMode === undefined) delete process.env.CAREER_AGENT_CONTEXT_MODE
      else process.env.CAREER_AGENT_CONTEXT_MODE = oldMode
      if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = oldKey
    }
  })

  test('keeps agent catalogues, unknown tools and shorter original descriptions', () => {
    const original = 'Launch agents.\nAvailable agent types and the tools they have access to:\nresearcher: research only\nWhen using the Agent tool, specify a type.\n' + 'Long example. '.repeat(500)
    const compact = compactToolDescription('Agent', original)
    expect(compact).toContain('researcher: research only')
    expect(compact.length).toBeLessThan(original.length)
    expect(compactToolDescription('Agent', 'Unrecognized fork protocol')).toBe('Unrecognized fork protocol')
    expect(compactToolDescription('custom_mcp_tool', 'Full contract')).toBe('Full contract')
    expect(compactToolDescription('Read', 'Read files')).toBe('Read files')
    const bash = compactToolDescription('Bash', 'Long rules. '.repeat(500) + '\nCo-Authored-By: Example <example@example.com>')
    expect(bash).toContain('Co-Authored-By: Example <example@example.com>')
    const sandboxRules = '## Command sandbox\nNetwork: {"allowedHosts":["example.com"]}\nAll commands MUST run in sandbox mode.\n'
    expect(compactToolDescription('Bash', 'Long rules. '.repeat(500) + '\n' + sandboxRules + '# Committing changes with git\nLong tutorial.')).toContain(sandboxRules.trim())
    expect(compactToolDescription('Read', 'Long file rules. '.repeat(100))).not.toContain('PDF')
    expect(compactToolDescription('AskUserQuestion', 'Exact questions/answers contract')).toBe('Exact questions/answers contract')
    const search = compactToolDescription('WebSearch', 'Long search rules. '.repeat(200) + '\n- The current month is October 2026. Use this year for recent queries.')
    expect(search).toContain('The current month is October 2026')
    expect(search).toContain('Sources:')
  })
})
