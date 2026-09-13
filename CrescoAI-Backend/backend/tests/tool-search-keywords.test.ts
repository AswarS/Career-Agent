import { describe, expect, test } from 'bun:test'
import { searchToolsWithKeywords } from '../src/tools/ToolSearchTool/ToolSearchTool.js'

describe('ToolSearch keyword matching', () => {
  test('recognizes multiple exact CamelCase names without select prefix', async () => {
    const deferredTools = [
      { name: 'FindReferralEntryPoints' },
      { name: 'NetworkContactMatcher' },
      { name: 'NetworkLeadVerification' },
      { name: 'NetworkActionPlan' },
    ] as any

    const matches = await searchToolsWithKeywords(
      'FindReferralEntryPoints NetworkContactMatcher NetworkLeadVerification NetworkActionPlan',
      deferredTools,
      deferredTools,
      5,
    )

    expect(matches).toEqual(deferredTools.map((tool: any) => tool.name))
  })
})
