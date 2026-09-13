import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installLocalSkill } from '../scripts/install-local-skill.js'
import { removeLocalSkill } from '../scripts/remove-local-skill.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'local-skill-installation-'))
  temporaryRoots.push(root)
  const sourceRoot = join(root, 'new_skills')
  const skillsDir = join(root, 'skills')
  const toolsDir = join(root, 'src/tools')
  const sourceDir = join(sourceRoot, 'sample-local-skill')
  await Promise.all([
    mkdir(sourceDir, { recursive: true }),
    mkdir(skillsDir, { recursive: true }),
    mkdir(toolsDir, { recursive: true }),
  ])
  await writeFile(
    join(sourceDir, 'SKILL.md'),
    [
      '---',
      'name: sample-local-skill',
      'description: Exercise one local Skill installation.',
      'model-entry: action-tool',
      'allowed-tools:',
      '  - WebSearch',
      '  - ReturnSkillResult',
      '---',
      '',
      '# Sample local Skill',
      '',
    ].join('\n'),
    'utf8',
  )
  await writeFile(
    join(sourceDir, 'action-tool.json'),
    `${JSON.stringify({
      tool_name: 'SampleLocalSkill',
      preserve_existing: true,
      always_load: true,
      child_tools: ['WebSearch'],
      input: {
        request: { type: 'string', required: true, description: 'Test request.' },
      },
    }, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    join(sourceDir, 'harness-tools.json'),
    '{"tools": []}\n',
    'utf8',
  )
  return { root, sourceRoot, sourceDir, skillsDir, toolsDir }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

describe('single local Skill installation', () => {
  test('accepts a source folder path, normalizes it, and generates a Tool', async () => {
    const fixture = await createFixture()
    const result = await installLocalSkill({
      skillName: 'sample-local-skill',
      sourceDir: fixture.sourceDir,
      skillsDir: fixture.skillsDir,
      toolsDir: fixture.toolsDir,
      write: true,
    })

    expect(result).toMatchObject({
      mode: 'write',
      skillName: 'sample-local-skill',
      toolName: 'SampleLocalSkill',
      disposition: 'create',
    })
    const installedConfig = JSON.parse(
      await readFile(join(fixture.skillsDir, 'sample-local-skill/action-tool.json'), 'utf8'),
    )
    expect(installedConfig.child_tools).toBeUndefined()
    expect(installedConfig.preserve_existing).toBe(false)
    expect(installedConfig.always_load).toBe(false)
    expect(installedConfig.input.request.required).toBe(false)
    expect(await pathExists(
      join(fixture.skillsDir, 'sample-local-skill/harness-tools.json'),
    )).toBe(true)
    expect(await pathExists(
      join(fixture.toolsDir, 'SampleLocalSkillTool/SampleLocalSkillTool.ts'),
    )).toBe(true)
  })

  test('removes a managed Skill by folder path and prunes its generated Tool', async () => {
    const fixture = await createFixture()
    const targetDir = join(fixture.skillsDir, 'sample-local-skill')
    await installLocalSkill({
      skillName: 'sample-local-skill',
      sourceDir: fixture.sourceDir,
      skillsDir: fixture.skillsDir,
      toolsDir: fixture.toolsDir,
      write: true,
    })

    const preview = await removeLocalSkill({
      skillPath: targetDir,
      skillsDir: fixture.skillsDir,
      toolsDir: fixture.toolsDir,
    })
    expect(preview).toMatchObject({ mode: 'plan', managed: true })

    const result = await removeLocalSkill({
      skillPath: targetDir,
      skillsDir: fixture.skillsDir,
      toolsDir: fixture.toolsDir,
      write: true,
    })
    expect(result.prunedTools).toEqual(['SampleLocalSkillTool'])
    expect(await pathExists(join(targetDir, 'SKILL.md'))).toBe(false)
    expect(await pathExists(
      join(fixture.toolsDir, 'SampleLocalSkillTool/SampleLocalSkillTool.ts'),
    )).toBe(false)
  })

  test('can preserve an explicitly declared hand-written Tool', async () => {
    const fixture = await createFixture()
    const customToolDir = join(fixture.toolsDir, 'SampleLocalSkillTool')
    await mkdir(customToolDir, { recursive: true })
    await writeFile(
      join(customToolDir, 'SampleLocalSkillTool.ts'),
      'export const SampleLocalSkillTool = {}\n',
      'utf8',
    )

    await installLocalSkill({
      skillName: 'sample-local-skill',
      sourceDir: fixture.sourceDir,
      skillsDir: fixture.skillsDir,
      toolsDir: fixture.toolsDir,
      write: true,
      preserveExistingTool: true,
    })

    const installedConfig = JSON.parse(
      await readFile(join(fixture.skillsDir, 'sample-local-skill/action-tool.json'), 'utf8'),
    )
    expect(installedConfig.preserve_existing).toBe(true)
    expect(await readFile(
      join(customToolDir, 'SampleLocalSkillTool.ts'),
      'utf8',
    )).toContain('export const SampleLocalSkillTool = {}')
  })

  test('refuses a folder outside the runtime skills directory', async () => {
    const fixture = await createFixture()
    expect(removeLocalSkill({
      skillPath: fixture.sourceDir,
      skillsDir: fixture.skillsDir,
      toolsDir: fixture.toolsDir,
    })).rejects.toThrow('must be a direct child')
  })
})
