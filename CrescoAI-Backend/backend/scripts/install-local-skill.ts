import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../src/utils/frontmatterParser.js'
import {
  buildSkillActionToolPlan,
  discoverSkillActionTools,
  writeSkillActionToolPlan,
} from './generate-skill-action-tools.js'

type JsonObject = Record<string, unknown>

export type LocalSkillInstallOptions = {
  skillName: string
  sourceRoot?: string
  sourceDir?: string
  skillsDir: string
  toolsDir: string
  write?: boolean
  updateExisting?: boolean
  alwaysLoad?: boolean
  preserveExistingTool?: boolean
  relaxInputs?: boolean
}

export type LocalSkillInstallPlan = {
  mode: 'plan' | 'write'
  skillName: string
  toolName: string
  sourceDir: string
  targetDir: string
  disposition: 'create' | 'update'
  normalizedActionConfig: JsonObject
  copiedPaths: string[]
  registryFile?: string
  namesRegistryFile?: string
}

const skillNamePattern = /^[a-z0-9][a-z0-9-]{0,63}$/
const toolNamePattern = /^[A-Z][A-Za-z0-9]{0,63}$/
const provenanceFileName = 'local-skill-source.json'
const supportedRuntimeConfigKeys = new Set([
  'tool_name',
  'user_facing_name',
  'search_hint',
  'preserve_existing',
  'always_load',
  'read_only',
  'input',
])
const supportedSourceConfigKeys = new Set([
  ...supportedRuntimeConfigKeys,
  'child_tools',
])

const usage = `Install one action-tool Skill from the repository new_skills directory.

Usage:
  bun run skill-tools:install-one --skill-path <path> [options]
  bun run skill-tools:install-one --skill <name> [options]
  bun run skill-tools:install-one <name> [options]

Options:
  --skill-path <path>     Path to the source Skill directory.
  --skill <name>          Skill directory name to install.
  --source-root <path>    Override the source directory (default: repository/new_skills).
  --skills-dir <path>     Override the runtime Skill directory.
  --tools-dir <path>      Override the generated Tool directory.
  --write                 Copy the Skill and regenerate Tool registries (default: dry-run).
  --update-existing       Update only a Skill previously installed by this script.
  --always-load           Eagerly expose the generated Tool schema (default: deferred).
  --preserve-existing-tool Keep a hand-written Tool implementation with the declared export.
  --keep-required-inputs  Preserve required=true fields (default: relax them for routing).
  --help                  Show this help.
`

function valuesForFlag(args: string[], flag: string): string[] {
  const values: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) values.push(args[index + 1]!)
  }
  return values
}

function valueForFlag(args: string[], flag: string): string | undefined {
  return valuesForFlag(args, flag)[0]
}

function positionalSkillName(args: string[]): string | undefined {
  const flagsWithValues = new Set([
    '--skill-path',
    '--skill',
    '--source-root',
    '--skills-dir',
    '--tools-dir',
  ])
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

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await readdir(dirname(path), { withFileTypes: true })).some(
      entry => entry.isDirectory() && entry.name === basename(path),
    )
  } catch {
    return false
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').sort()
    : []
}

function normalizeActionConfig(
  rawConfig: JsonObject,
  declaredTools: string[],
  options: Pick<LocalSkillInstallOptions, 'alwaysLoad' | 'preserveExistingTool' | 'relaxInputs'>,
): JsonObject {
  const unknownKeys = Object.keys(rawConfig).filter(key => !supportedSourceConfigKeys.has(key))
  if (unknownKeys.length > 0) {
    throw new Error(`Unsupported action-tool.json keys: ${unknownKeys.sort().join(', ')}`)
  }

  const childTools = stringArray(rawConfig.child_tools)
  if (JSON.stringify(childTools) !== JSON.stringify([...declaredTools].sort())) {
    throw new Error(
      'action-tool.json child_tools must match SKILL.md allowed-tools excluding ReturnSkillResult',
    )
  }

  const normalized = Object.fromEntries(
    Object.entries(rawConfig).filter(([key]) => supportedRuntimeConfigKeys.has(key)),
  ) as JsonObject
  normalized.preserve_existing = options.preserveExistingTool ?? false
  normalized.always_load = options.alwaysLoad ?? false

  if (options.relaxInputs !== false && normalized.input && typeof normalized.input === 'object') {
    normalized.input = Object.fromEntries(
      Object.entries(normalized.input as JsonObject).map(([name, rawField]) => [
        name,
        rawField && typeof rawField === 'object' && !Array.isArray(rawField)
          ? { ...(rawField as JsonObject), required: false }
          : rawField,
      ]),
    )
  }
  return normalized
}

async function assertUpdateOwnership(targetDir: string, skillName: string): Promise<void> {
  let provenance: JsonObject
  try {
    provenance = await readJson(join(targetDir, provenanceFileName))
  } catch {
    throw new Error(`Refusing to update a Skill not installed by this script: ${targetDir}`)
  }
  if (provenance.source_kind !== 'new_skills' || provenance.skill_name !== skillName) {
    throw new Error(`Local Skill provenance does not match ${skillName}: ${targetDir}`)
  }
}

export async function installLocalSkill(
  input: LocalSkillInstallOptions,
): Promise<LocalSkillInstallPlan> {
  const skillName = input.skillName.trim()
  if (!skillNamePattern.test(skillName)) {
    throw new Error(`Invalid Skill name ${JSON.stringify(skillName)}`)
  }

  const sourceRoot = resolve(input.sourceRoot ?? dirname(resolve(input.sourceDir ?? '.')))
  const skillsDir = resolve(input.skillsDir)
  const toolsDir = resolve(input.toolsDir)
  const sourceDir = resolve(input.sourceDir ?? join(sourceRoot, skillName))
  if (basename(sourceDir) !== skillName) {
    throw new Error(`Source directory name ${basename(sourceDir)} does not match ${skillName}`)
  }
  const targetDir = join(skillsDir, skillName)
  if (!await directoryExists(sourceDir)) throw new Error(`Source Skill does not exist: ${sourceDir}`)

  const skillFile = join(sourceDir, 'SKILL.md')
  const skillSource = await readFile(skillFile, 'utf8')
  const { frontmatter } = parseFrontmatter(skillSource, skillFile)
  if (frontmatter.name !== skillName) {
    throw new Error(`SKILL.md name ${JSON.stringify(frontmatter.name)} does not match ${skillName}`)
  }
  if (frontmatter['model-entry'] !== 'action-tool') {
    throw new Error(`Skill ${skillName} must use model-entry: action-tool`)
  }

  const declaredTools = stringArray(frontmatter['allowed-tools'])
    .filter(toolName => toolName !== 'ReturnSkillResult')
  const rawConfig = await readJson(join(sourceDir, 'action-tool.json'))
  const normalizedActionConfig = normalizeActionConfig(rawConfig, declaredTools, input)
  const toolName = String(normalizedActionConfig.tool_name ?? '').trim()
  if (!toolNamePattern.test(toolName)) {
    throw new Error(`Invalid or missing Tool name for ${skillName}: ${JSON.stringify(toolName)}`)
  }

  const targetExists = await directoryExists(targetDir)
  if (targetExists && !input.updateExisting) {
    throw new Error(`Target Skill already exists; pass --update-existing to refresh it: ${targetDir}`)
  }
  if (targetExists) await assertUpdateOwnership(targetDir, skillName)

  const existingSpecs = await discoverSkillActionTools({ skillsDir, toolsDir })
  const collision = existingSpecs.find(
    spec => spec.skillName !== skillName && spec.toolName === toolName,
  )
  if (collision) {
    throw new Error(`Tool ${toolName} already belongs to Skill ${collision.skillName}`)
  }

  const optionalPaths = [
    'skilltool.json',
    'harness-tools.json',
    'relation-contract.json',
    'tests',
  ]
  const copiedPaths = ['SKILL.md', 'action-tool.json']
  for (const relativePath of optionalPaths) {
    try {
      await readFile(join(sourceDir, relativePath))
      copiedPaths.push(relativePath)
    } catch {
      if (relativePath === 'tests' && await directoryExists(join(sourceDir, relativePath))) {
        copiedPaths.push(relativePath)
      }
    }
  }

  const result: LocalSkillInstallPlan = {
    mode: input.write ? 'write' : 'plan',
    skillName,
    toolName,
    sourceDir,
    targetDir,
    disposition: targetExists ? 'update' : 'create',
    normalizedActionConfig,
    copiedPaths,
  }
  if (!input.write) return result

  await mkdir(targetDir, { recursive: true })
  await writeFile(join(targetDir, 'SKILL.md'), skillSource, 'utf8')
  await writeFile(
    join(targetDir, 'action-tool.json'),
    `${JSON.stringify(normalizedActionConfig, null, 2)}\n`,
    'utf8',
  )
  for (const relativePath of optionalPaths) {
    const source = join(sourceDir, relativePath)
    try {
      await cp(source, join(targetDir, relativePath), { recursive: true, force: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  await writeFile(
    join(targetDir, provenanceFileName),
    `${JSON.stringify({
      source_kind: 'new_skills',
      skill_name: skillName,
      source_path: relative(dirname(skillsDir), sourceDir).replaceAll('\\', '/'),
    }, null, 2)}\n`,
    'utf8',
  )

  const toolPlan = await buildSkillActionToolPlan({ skillsDir, toolsDir })
  await writeSkillActionToolPlan(toolPlan)
  result.registryFile = toolPlan.registryFile
  result.namesRegistryFile = toolPlan.namesRegistryFile
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
  const skillPath = valueForFlag(args, '--skill-path')
  const positional = positionalSkillName(args)
  const positionalIsPath = Boolean(
    positional && (positional.includes('/') || positional.includes('\\')),
  )
  const sourceDir = skillPath ?? (positionalIsPath ? positional : undefined)
  const skillName = valueForFlag(args, '--skill')
    ?? (sourceDir ? basename(resolve(sourceDir)) : positional)
  if (!skillName) {
    throw new Error('Missing Skill input; pass --skill-path <path> or --skill <name>')
  }

  const result = await installLocalSkill({
    skillName,
    sourceDir,
    sourceRoot: valueForFlag(args, '--source-root') ?? join(projectRoot, 'new_skills'),
    skillsDir: valueForFlag(args, '--skills-dir') ?? join(projectRoot, 'skills'),
    toolsDir: valueForFlag(args, '--tools-dir') ?? join(backendDir, 'src/tools'),
    write: args.includes('--write'),
    updateExisting: args.includes('--update-existing'),
    alwaysLoad: args.includes('--always-load'),
    preserveExistingTool: args.includes('--preserve-existing-tool'),
    relaxInputs: !args.includes('--keep-required-inputs'),
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (import.meta.main) await main()
