/** Offline comparison; no inference calls and no raw user messages in output. */
import { resolve } from 'node:path'
import { getSystemPrompt } from '../src/constants/prompts.js'
import { compactToolDescription } from '../src/constants/compactContext.js'
import { CAREER_AGENT_LEARNING_SYSTEM_PROMPT } from '../src/Network/prompts/careerAgentLearningPrompt.js'
import { getProfileAgentSystemPrompt } from '../src/Network/modules/profile/profile-agent.prompt.js'
import { getCareerAgentMemoryRoutingPrompt } from '../src/Network/prompts/careerAgentMemoryRoutingPrompt.js'
import type { Tool } from '../src/Tool.js'

const root = resolve(import.meta.dir, '../../..')
const archive = resolve(root, 'trajectory_gen/archive/context-before-compact-20261027-v1')
const baseline = await Bun.file(resolve(archive, 'captured-baseline.json')).json()
const tools = baseline.tools.map((tool: any) => ({ name: tool.function.name })) as Tool[]
const oldMode = process.env.CAREER_AGENT_CONTEXT_MODE
const oldKey = process.env.ANTHROPIC_API_KEY
const oldSimple = process.env.CLAUDE_CODE_SIMPLE
const oldNodeEnv = process.env.NODE_ENV
const chars = (value: unknown) => Array.from(typeof value === 'string' ? value : JSON.stringify(value)).length
try {
  process.env.NODE_ENV = 'test'
  process.env.ANTHROPIC_API_KEY ||= 'offline-prompt-measurement-only'
  process.env.CLAUDE_CODE_SIMPLE = '0'
  process.env.CAREER_AGENT_CONTEXT_MODE = 'full'
  const full = await getSystemPrompt(tools, 'GLM-5.2')
  process.env.CAREER_AGENT_CONTEXT_MODE = 'compact'
  const compact = await getSystemPrompt(tools, 'GLM-5.2')
  const appended = [CAREER_AGENT_LEARNING_SYSTEM_PROMPT, getProfileAgentSystemPrompt(), getCareerAgentMemoryRoutingPrompt()].filter(Boolean).join('\n\n')
  const compactTools = structuredClone(baseline.tools)
  for (const tool of compactTools) tool.function.description = compactToolDescription(tool.function.name, tool.function.description ?? '')
  const fullSystemChars = chars([...full, appended].join('\n\n'))
  const compactSystemChars = chars([...compact, appended].join('\n\n'))
  const fullToolsChars = chars(baseline.tools)
  const compactToolsChars = chars(compactTools)
  const result = {
    generatedAt: new Date().toISOString(),
    measurement: 'Unicode characters, not GLM tokens. System compares current assembly full/compact under identical local configuration; tool schemas compare the archived 27-tool wire fixture with description-only compaction. Wire identity/billing preambles and chat-template framing excluded.',
    fullSystemChars, compactSystemChars, systemReductionPercent: 100*(1-compactSystemChars/fullSystemChars),
    fullToolsChars, compactToolsChars, toolsReductionPercent: 100*(1-compactToolsChars/fullToolsChars),
    combinedReductionPercent: 100*(1-(compactSystemChars+compactToolsChars)/(fullSystemChars+fullToolsChars)),
    toolCountBefore: baseline.tools.length, toolCountAfter: compactTools.length,
    parametersUnchanged: baseline.tools.every((t: any, i: number) => JSON.stringify(t.function.parameters) === JSON.stringify(compactTools[i].function.parameters)),
    changedTools: baseline.tools.flatMap((t: any, i: number) => t.function.description === compactTools[i].function.description ? [] : [{name:t.function.name,before:chars(t),after:chars(compactTools[i])}]),
  }
  const comparison = resolve(root, 'trajectory_gen/reports/context-compaction-20261027/comparison')
  await Promise.all([
    Bun.write(resolve(comparison,'system-before.txt'),[...full,appended].join('\n\n')+'\n'),
    Bun.write(resolve(comparison,'system-after.txt'),[...compact,appended].join('\n\n')+'\n'),
    Bun.write(resolve(comparison,'tools-before.json'),JSON.stringify(baseline.tools,null,2)+'\n'),
    Bun.write(resolve(comparison,'tools-after.json'),JSON.stringify(compactTools,null,2)+'\n'),
    Bun.write(resolve(comparison,'tool-descriptions-before.txt'),baseline.tools.map((t:any)=>`# ${t.function.name}\n\n${t.function.description??''}\n`).join('\n')),
    Bun.write(resolve(comparison,'tool-descriptions-after.txt'),compactTools.map((t:any)=>`# ${t.function.name}\n\n${t.function.description??''}\n`).join('\n')),
  ])
  await Bun.write(resolve(root,'trajectory_gen/reports/context-compaction-20261027/measurement.json'),JSON.stringify(result,null,2)+'\n')
  console.log(JSON.stringify(result,null,2))
} finally {
  for (const [key, value] of [['CAREER_AGENT_CONTEXT_MODE',oldMode],['ANTHROPIC_API_KEY',oldKey],['CLAUDE_CODE_SIMPLE',oldSimple],['NODE_ENV',oldNodeEnv]]) {
    if (value === undefined) delete process.env[key!]
    else process.env[key!] = value
  }
}
