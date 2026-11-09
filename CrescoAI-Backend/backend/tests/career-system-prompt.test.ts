import { describe, expect, test } from 'bun:test'
import { DEFAULT_AGENT_PROMPT, getSystemPrompt } from '../src/constants/prompts.js'
import { CLI_SYSPROMPT_PREFIXES, getCLISyspromptPrefix } from '../src/constants/system.js'

describe('Career-Agent system prompt', () => {
  test('uses the career identity in transport prefixes, including the noninteractive SDK path', () => {
    for (const options of [undefined, { isNonInteractive: true, hasAppendSystemPrompt: true }, { isNonInteractive: true, hasAppendSystemPrompt: false }]) {
      const prefix = getCLISyspromptPrefix(options)
      expect(prefix).toContain('You are Career-Agent')
      expect(prefix).not.toMatch(/Claude|Anthropic/)
      expect(CLI_SYSPROMPT_PREFIXES.has(prefix)).toBe(true)
    }
  })
  test('assembles career guidance with tool and action rules, without CLI product instructions', async () => {
    const previousSimple = process.env.CLAUDE_CODE_SIMPLE
    const previousApiKey = process.env.ANTHROPIC_API_KEY
    // Command discovery checks for credentials; this test makes no API requests.
    process.env.ANTHROPIC_API_KEY = 'test-prompt-assembly-only'
    process.env.CLAUDE_CODE_SIMPLE = '0'
    try {
      const prompt = (await getSystemPrompt([], 'GLM-5.2')).join('\n\n')
      expect(prompt).toContain('You are Career-Agent')
      expect(prompt).toContain('career goals, profile, supplied materials')
      expect(prompt).toContain('practical timeline')
      expect(prompt).toContain('# Executing actions with care')
      expect(prompt).toContain('# System')
      expect(prompt).not.toMatch(/Claude Code|official CLI for Claude|\/share|\/fast|primarily request you to perform software engineering/)
      expect(prompt).not.toContain('default to the latest and most capable Claude models')
    } finally {
      if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = previousApiKey
      if (previousSimple === undefined) delete process.env.CLAUDE_CODE_SIMPLE
      else process.env.CLAUDE_CODE_SIMPLE = previousSimple
    }
  })

  test('keeps the same identity in simple mode and delegated task instructions', async () => {
    const previousSimple = process.env.CLAUDE_CODE_SIMPLE
    process.env.CLAUDE_CODE_SIMPLE = '1'
    try {
      const prompt = (await getSystemPrompt([], 'GLM-5.2')).join('\n')
      expect(prompt).toContain('You are Career-Agent')
      expect(prompt).not.toContain('Claude Code')
      expect(DEFAULT_AGENT_PROMPT).toContain('Career-Agent')
      expect(DEFAULT_AGENT_PROMPT).not.toContain('Claude Code')
    } finally {
      if (previousSimple === undefined) delete process.env.CLAUDE_CODE_SIMPLE
      else process.env.CLAUDE_CODE_SIMPLE = previousSimple
    }
  })
})
