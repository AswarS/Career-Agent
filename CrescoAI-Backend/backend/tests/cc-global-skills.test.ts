import { describe, expect, test } from 'bun:test'
import { getBundledSkills } from '../src/skills/bundledSkills.js'
import { registerCareerAgentSkills } from '../src/skills/bundled/careerAgent.js'
import {
  SkillService,
  USER_DEFINED_SKILLS_ENABLED,
} from '../src/Network/modules/skill/skill.service.js'
import { SkillRegistry } from '../src/Network/modules/skill/skill.registry.js'

const CAREER_AGENT_SKILL_NAMES = [
  'career_direction_exploration',
  'career_path_simulation',
  'code-analysis',
  'develop-web-game',
  'image-generation',
  'industry_opportunity_analysis',
  'learning-plan',
  'role_cognition_analysis',
  'target_role_positioning',
  'video-generation',
].sort()

const PACKAGED_GLOBAL_SKILL_NAMES = [
  'career_direction_exploration',
  'career_path_simulation',
  'industry_opportunity_analysis',
  'role_cognition_analysis',
  'target_role_positioning',
]

registerCareerAgentSkills()

describe('CareerAgent skills on the native CC skill chain', () => {
  test('registers the same global skills for every user', () => {
    const names = getBundledSkills()
      .map(skill => skill.name)
      .filter(name => CAREER_AGENT_SKILL_NAMES.includes(name))
      .sort()

    expect(names).toEqual(CAREER_AGENT_SKILL_NAMES)
    expect(USER_DEFINED_SKILLS_ENABLED).toBe(false)
  })

  test('rejects user-defined skill creation without writing a skill file', async () => {
    const service = new SkillService(new SkillRegistry())
    let status: number | undefined

    try {
      await service.createCustomSkill(
        42,
        'private-skill',
        'private skill',
        'private instructions',
      )
    } catch (error) {
      status = (error as { getStatus?: () => number }).getStatus?.()
    }

    expect(status).toBe(501)
  })

  test('exposes packaged skills from the root skills directory through the backend catalog', async () => {
    const service = new SkillService(new SkillRegistry())
    const skills = await service.listSkills(42)
    const names = skills.map(skill => skill.name)

    for (const name of PACKAGED_GLOBAL_SKILL_NAMES) {
      expect(names).toContain(name)
    }
  })

  test('loads a packaged root skill prompt with its reference-file base directory', async () => {
    const skill = getBundledSkills().find(
      item => item.name === 'career_direction_exploration',
    )

    expect(skill).toBeDefined()
    expect(skill?.userInvocable).toBe(true)
    if (!skill || skill.type !== 'prompt') {
      throw new Error('career_direction_exploration was not registered')
    }

    const blocks = await skill.getPromptForCommand(
      'Compare several realistic directions for me.',
      {} as never,
    )
    const text = blocks
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')

    expect(text).toContain('Base directory for this skill:')
    expect(text).toContain('Career Direction Exploration')
    expect(text).toContain('references/output_contract.md')
    expect(text).toContain('Compare several realistic directions for me.')
  })

  test('keeps the canonical underscore name on CC invocation', async () => {
    let prompt = ''
    const agentService = {
      async runIsolatedPrompt(input: { content: string }) {
        prompt = input.content
        return { success: true, reply: 'ok' }
      },
    }
    const service = new SkillService(
      new SkillRegistry(),
      undefined,
      agentService as never,
    )

    const result = await service.invokeSkillThroughCc(
      'career_direction_exploration',
      'test request',
      { userId: 42 },
    )

    expect(result.success).toBe(true)
    expect(prompt).toBe('/career_direction_exploration test request')
  })

  test('loads the disk-backed learning-plan prompt and appends slash arguments', async () => {
    const skill = getBundledSkills().find(item => item.name === 'learning-plan')

    expect(skill).toBeDefined()
    if (!skill || skill.type !== 'prompt') {
      throw new Error('learning-plan was not registered as a prompt skill')
    }
    const blocks = await skill.getPromptForCommand(
      '为后端面试制定三个月学习计划',
      {} as never,
    )
    const text = blocks
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')

    expect(text).toContain('Base directory for this skill:')
    expect(text).toContain('为后端面试制定三个月学习计划')
  })

  test('resolves CLAUDE_SKILL_DIR for the web-game skill', async () => {
    const skill = getBundledSkills().find(
      item => item.name === 'develop-web-game',
    )

    expect(skill).toBeDefined()
    if (!skill || skill.type !== 'prompt') {
      throw new Error('develop-web-game was not registered as a prompt skill')
    }
    const blocks = await skill.getPromptForCommand('构建贪吃蛇游戏', {} as never)
    const text = blocks
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')

    expect(text).toContain('构建贪吃蛇游戏')
    expect(text).not.toContain('${CLAUDE_SKILL_DIR}')
    expect(text).toContain('web_game_playwright_client.js')
  })
})
