import { mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../src/utils/frontmatterParser.js'
import {
  buildSkillActionToolPlan,
  discoverSkillActionTools,
  pruneStaleGeneratedSkillActionTools,
  writeSkillActionToolPlan,
} from './generate-skill-action-tools.js'

type JsonObject = Record<string, unknown>

export type LocalSkillRemoveOptions = {
  skillPath: string
  skillsDir: string
  toolsDir: string
  write?: boolean
  allowUnmanaged?: boolean
}

export type LocalSkillRemovePlan = {
  mode: 'plan' | 'write'
  skillName: string
  toolName: string
  targetDir: string
  managed: boolean
  prunedTools: string[]
  registryFile?: string
  namesRegistryFile?: string
}

const skillNamePattern = /^[a-z0-9][a-z0-9-]{0,63}$/
const provenanceFileName = 'local-skill-source.json'

const usage = `Remove one installed local Skill and refresh generated Tool registries.

Usage:
  bun run skill-tools:remove-one --skill-path <path> [options]
  bun run skill-tools:remove-one <path> [options]

Options:
  --skill-path <path>  Path to an installed direct child of the runtime skills directory.
  --skills-dir <path>  Override the runtime Skill directory.
  --tools-dir <path>   Override the generated Tool directory.
  --write              Remove the Skill and refresh registries (default: dry-run).
  --allow-unmanaged    Permit removal of a Skill not installed by install-local-skill.ts.
  --help               Show this help.
`

function valueForFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

function positionalPath(args: string[]): string | undefined {
  const flagsWithValues = new Set(['--skill-path', '--skills-dir', '--tools-dir'])
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (flagsWithValues.has(arg)) {
      index += 1
      continue
    }
    if (arg === '--' || arg.startsWith('--')) continue
    return arg
  }
  return undefined
}

async function readJson(path: string): Promise<JsonObject> {
  const value = JSON.parse(await readFile(path, 'utf8')) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected a JSON object in ${path}`)
  }
  return value as JsonObject
}

async function isManaged(targetDir: string, skillName: string): Promise<boolean> {
  try {
    const provenance = await readJson(join(targetDir, provenanceFileName))
    return provenance.source_kind === 'new_skills' && provenance.skill_name === skillName
  } catch {
    return false
  }
}

async function restoreAfterFailure(
  backupDir: string,
  targetDir: string,
  skillsDir: string,
  toolsDir: string,
): Promise<void> {
  await rename(backupDir, targetDir)
  const restorePlan = await buildSkillActionToolPlan({ skillsDir, toolsDir })
  await writeSkillActionToolPlan(restorePlan)
}

export async function removeLocalSkill(
  input: LocalSkillRemoveOptions,
): Promise<LocalSkillRemovePlan> {
  const skillsDir = resolve(input.skillsDir)
  const toolsDir = resolve(input.toolsDir)
  const targetDir = resolve(input.skillPath)
  if (dirname(targetDir) !== skillsDir) {
    throw new Error(`Skill path must be a direct child of ${skillsDir}: ${targetDir}`)
  }

  const skillName = basename(targetDir)
  if (!skillNamePattern.test(skillName)) {
    throw new Error(`Invalid Skill directory name ${JSON.stringify(skillName)}`)
  }
  const skillFile = join(targetDir, 'SKILL.md')
  const skillSource = await readFile(skillFile, 'utf8')
  const { frontmatter } = parseFrontmatter(skillSource, skillFile)
  if (frontmatter.name !== skillName) {
    throw new Error(`SKILL.md name ${JSON.stringify(frontmatter.name)} does not match ${skillName}`)
  }
  if (frontmatter['model-entry'] !== 'action-tool') {
    throw new Error(`Skill ${skillName} is not an action-tool Skill`)
  }

  const managed = await isManaged(targetDir, skillName)
  if (!managed && !input.allowUnmanaged) {
    throw new Error(
      `Refusing to remove unmanaged Skill ${skillName}; pass --allow-unmanaged if intentional`,
    )
  }
  const specs = await discoverSkillActionTools({ skillsDir, toolsDir })
  const spec = specs.find(candidate => candidate.skillName === skillName)
  if (!spec) throw new Error(`No generated Tool specification found for ${skillName}`)

  const result: LocalSkillRemovePlan = {
    mode: input.write ? 'write' : 'plan',
    skillName,
    toolName: spec.toolName,
    targetDir,
    managed,
    prunedTools: [],
  }
  if (!input.write) return result

  const backupRoot = await mkdtemp(join(dirname(skillsDir), '.skill-uninstall-'))
  const backupDir = join(backupRoot, skillName)
  await mkdir(backupRoot, { recursive: true })
  await rename(targetDir, backupDir)
  try {
    const toolPlan = await buildSkillActionToolPlan({ skillsDir, toolsDir })
    await writeSkillActionToolPlan(toolPlan)
    result.prunedTools = await pruneStaleGeneratedSkillActionTools(toolPlan, toolsDir)
    result.registryFile = toolPlan.registryFile
    result.namesRegistryFile = toolPlan.namesRegistryFile
  } catch (error) {
    try {
      await restoreAfterFailure(backupDir, targetDir, skillsDir, toolsDir)
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        `Failed to remove ${skillName} and failed to restore its generated registration`,
      )
    }
    throw error
  } finally {
    await rm(backupRoot, { recursive: true, force: true })
  }
  return result
}

async function main(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const backendDir = resolve(scriptDir, '..')
  const projectRoot = resolve(backendDir, '../..')
  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    process.stdout.write(usage)
    return
  }

  const skillPath = valueForFlag(args, '--skill-path') ?? positionalPath(args)
  if (!skillPath) throw new Error('Missing Skill folder path; pass --skill-path <path>')
  const result = await removeLocalSkill({
    skillPath,
    skillsDir: valueForFlag(args, '--skills-dir') ?? join(projectRoot, 'skills'),
    toolsDir: valueForFlag(args, '--tools-dir') ?? join(backendDir, 'src/tools'),
    write: args.includes('--write'),
    allowUnmanaged: args.includes('--allow-unmanaged'),
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (import.meta.main) await main()
