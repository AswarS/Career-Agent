import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '../src/utils/frontmatterParser.js'

type JsonObject = Record<string, unknown>

type InstallCandidate = {
  runId: string
  sourceDir: string
  targetDir: string
  skillName: string
  toolName: string
  skillSource: string
  actionConfig: JsonObject
}

type CurationPolicy = {
  version: number
  profile: string
  retained: string[]
  retired: Record<string, { merged_into: string; reason: string }>
  overrides?: Record<string, { search_hint?: string; user_facing_name?: string }>
}

const supportedActionConfigKeys = new Set([
  'tool_name',
  'user_facing_name',
  'search_hint',
  'preserve_existing',
  'always_load',
  'read_only',
  'input',
])

const usage = `Install directly validated SkillTool synthesis runs into the Career Agent runtime.

Usage:
  bun run skill-tools:install-runs [options]

Options:
  --run-id <id>        Install one run; repeat to merge selected runs.
  --runs-root <path>   Override the synthesis runs directory.
  --skills-dir <path>  Override the runtime Skill directory.
  --profile <core|all> Install the curated core (default) or every validated Skill.
  --curation-file <p>  Override the core curation policy file.
  --write              Apply the validated plan (default is dry-run).
  --update-existing    Refresh only Skills previously installed from the same run.
  --prune              Remove retired Skills installed from the selected runs.
  --always-load        Make imported tools eager; deferred loading is the safe default.
  --help               Show this help.
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, 'utf8')) as JsonObject
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

async function completedRunDirectories(runsRoot: string): Promise<string[]> {
  const entries = await readdir(runsRoot, { withFileTypes: true })
  const result: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || !entry.name.startsWith('run-')) continue
    const runDir = join(runsRoot, entry.name)
    try {
      const run = await readJson(join(runDir, 'run.json'))
      const summary = (run.summary ?? {}) as JsonObject
      if (
        run.run_status === 'completed' &&
        summary.quality_status === 'direct_validation_passed' &&
        await directoryExists(join(runDir, 'generated-skills'))
      ) {
        result.push(runDir)
      }
    } catch {
      // A partial or legacy run is not installable through this path.
    }
  }
  return result
}

async function collectCandidate(
  runDir: string,
  skillDir: string,
  skillsDir: string,
  alwaysLoad: boolean,
  relaxInputs: boolean,
  override?: { search_hint?: string; user_facing_name?: string },
): Promise<InstallCandidate> {
  const skillFile = join(skillDir, 'SKILL.md')
  const skillSource = await readFile(skillFile, 'utf8')
  const { frontmatter } = parseFrontmatter(skillSource, skillFile)
  const skillName = String(frontmatter.name ?? '').trim()
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(skillName)) {
    throw new Error(`Invalid synthesized Skill name ${JSON.stringify(skillName)} in ${skillFile}`)
  }
  if (skillName !== basename(skillDir)) {
    throw new Error(`Synthesized Skill directory ${basename(skillDir)} does not match ${skillName}`)
  }
  if (frontmatter['model-entry'] !== 'action-tool') {
    throw new Error(`Synthesized Skill ${skillName} is not configured for action-tool entry`)
  }

  const rawConfig = await readJson(join(skillDir, 'action-tool.json'))
  const childTools = stringArray(rawConfig.child_tools).sort()
  const declaredTools = stringArray(frontmatter['allowed-tools'])
    .filter(name => name !== 'ReturnSkillResult')
    .sort()
  if (JSON.stringify(childTools) !== JSON.stringify(declaredTools)) {
    throw new Error(
      `Synthesized Skill ${skillName} child_tools do not match SKILL.md allowed-tools`,
    )
  }

  const toolName = String(rawConfig.tool_name ?? '').trim()
  if (!/^[A-Z][A-Za-z0-9]{0,63}$/.test(toolName)) {
    throw new Error(`Invalid synthesized Tool name ${JSON.stringify(toolName)} for ${skillName}`)
  }

  const actionConfig = Object.fromEntries(
    Object.entries(rawConfig).filter(([key]) => supportedActionConfigKeys.has(key)),
  )
  // Synthesized runs do not ship hand-written Tool implementations. Let the
  // existing factory create their adapters instead of preserving a missing one.
  actionConfig.preserve_existing = false
  // A synthesis run can contain dozens of tools. Loading every schema on every
  // model turn makes the normal web conversation path too large and slow.
  // Generated tools have search hints, so defer them unless explicitly asked.
  actionConfig.always_load = alwaysLoad
  if (relaxInputs && actionConfig.input && typeof actionConfig.input === 'object') {
    actionConfig.input = Object.fromEntries(
      Object.entries(actionConfig.input as JsonObject).map(([name, rawField]) => {
        const field = rawField && typeof rawField === 'object'
          ? { ...(rawField as JsonObject), required: false }
          : rawField
        return [name, field]
      }),
    )
  }
  if (override?.search_hint) actionConfig.search_hint = override.search_hint
  if (override?.user_facing_name) actionConfig.user_facing_name = override.user_facing_name

  return {
    runId: basename(runDir),
    sourceDir: skillDir,
    targetDir: join(skillsDir, skillName),
    skillName,
    toolName,
    skillSource,
    actionConfig,
  }
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
  const runsRoot = resolve(
    valueForFlag(args, '--runs-root') ?? join(projectRoot, 'skilltool-synthesis-lab/runs'),
  )
  const skillsDir = resolve(valueForFlag(args, '--skills-dir') ?? join(projectRoot, 'skills'))
  const explicitRunIds = valuesForFlag(args, '--run-id')
  const profile = valueForFlag(args, '--profile') ?? 'core'
  if (profile !== 'core' && profile !== 'all') {
    throw new Error(`Unsupported profile ${JSON.stringify(profile)}; expected core or all`)
  }
  const curationFile = resolve(
    valueForFlag(args, '--curation-file') ?? join(scriptDir, 'synthesis-skill-curation.json'),
  )
  const curation = profile === 'core'
    ? await readJson(curationFile) as unknown as CurationPolicy
    : null
  const retained = new Set(curation?.retained ?? [])
  if (curation) {
    if (!Number.isInteger(curation.version) || curation.version < 1) {
      throw new Error('Core curation policy must have a positive integer version')
    }
    if (retained.size !== curation.retained.length) {
      throw new Error('Core curation policy contains duplicate retained Skill names')
    }
    for (const [skillName, decision] of Object.entries(curation.retired)) {
      if (retained.has(skillName)) {
        throw new Error(`Core curation policy classifies ${skillName} as retained and retired`)
      }
      if (!retained.has(decision.merged_into)) {
        throw new Error(
          `Retired Skill ${skillName} merges into non-retained Skill ${decision.merged_into}`,
        )
      }
    }
  }
  const alwaysLoad = args.includes('--always-load')
  const updateExisting = args.includes('--update-existing')
  const runDirs = explicitRunIds.length > 0
    ? explicitRunIds.map(runId => join(runsRoot, runId))
    : await completedRunDirectories(runsRoot)
  if (runDirs.length === 0) throw new Error('No completed, directly validated synthesis runs found')

  const candidates: InstallCandidate[] = []
  for (const runDir of runDirs) {
    const run = await readJson(join(runDir, 'run.json'))
    const summary = (run.summary ?? {}) as JsonObject
    if (
      run.run_status !== 'completed' ||
      summary.quality_status !== 'direct_validation_passed'
    ) {
      throw new Error(`${basename(runDir)} is not completed with direct validation passed`)
    }
    const generatedDir = join(runDir, 'generated-skills')
    const entries = await readdir(generatedDir, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory()) {
        const skillName = entry.name
        if (curation && !retained.has(skillName) && !curation.retired[skillName]) {
          throw new Error(`Core curation policy does not classify synthesized Skill ${skillName}`)
        }
        if (curation && !retained.has(skillName)) continue
        candidates.push(await collectCandidate(
          runDir,
          join(generatedDir, entry.name),
          skillsDir,
          alwaysLoad,
          profile === 'core',
          curation?.overrides?.[skillName],
        ))
      }
    }
  }

  const seenSkills = new Set<string>()
  const seenTools = new Set<string>()
  for (const candidate of candidates) {
    if (seenSkills.has(candidate.skillName)) throw new Error(`Duplicate Skill ${candidate.skillName}`)
    if (seenTools.has(candidate.toolName)) throw new Error(`Duplicate Tool ${candidate.toolName}`)
    if (await directoryExists(candidate.targetDir)) {
      if (!updateExisting) {
        throw new Error(`Target Skill already exists: ${candidate.targetDir}`)
      }
      let provenance: JsonObject
      try {
        provenance = await readJson(join(candidate.targetDir, 'synthesis-source.json'))
      } catch {
        throw new Error(
          `Refusing to update non-synthesis Skill directory: ${candidate.targetDir}`,
        )
      }
      if (provenance.run_id !== candidate.runId) {
        throw new Error(
          `Refusing to replace ${candidate.skillName} from ${String(provenance.run_id)} with ${candidate.runId}`,
        )
      }
    }
    seenSkills.add(candidate.skillName)
    seenTools.add(candidate.toolName)
  }

  const write = args.includes('--write')
  const pruned: string[] = []
  if (write) {
    for (const candidate of candidates) {
      await mkdir(candidate.targetDir, { recursive: true })
      await writeFile(join(candidate.targetDir, 'SKILL.md'), candidate.skillSource, 'utf8')
      await writeFile(
        join(candidate.targetDir, 'action-tool.json'),
        `${JSON.stringify(candidate.actionConfig, null, 2)}\n`,
        'utf8',
      )
      for (const relativePath of ['skilltool.json', 'tests']) {
        const source = join(candidate.sourceDir, relativePath)
        try {
          await cp(source, join(candidate.targetDir, relativePath), { recursive: true })
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      await writeFile(
        join(candidate.targetDir, 'synthesis-source.json'),
        `${JSON.stringify({ run_id: candidate.runId, source: candidate.sourceDir }, null, 2)}\n`,
        'utf8',
      )
    }
    if (args.includes('--prune')) {
      const selectedRunIds = new Set(runDirs.map(runDir => basename(runDir)))
      const installedEntries = await readdir(skillsDir, { withFileTypes: true })
      for (const entry of installedEntries) {
        if (!entry.isDirectory() || seenSkills.has(entry.name)) continue
        const targetDir = join(skillsDir, entry.name)
        let provenance: JsonObject
        try {
          provenance = await readJson(join(targetDir, 'synthesis-source.json'))
        } catch {
          continue
        }
        if (!selectedRunIds.has(String(provenance.run_id))) continue
        await rm(targetDir, { recursive: true, force: true })
        pruned.push(entry.name)
      }
      pruned.sort()
    }
  }

  process.stdout.write(`${JSON.stringify({
    mode: write ? 'write' : 'plan',
    profile,
    curation_version: curation?.version ?? null,
    runs: runDirs.map(runDir => basename(runDir)),
    retired: curation ? Object.keys(curation.retired).sort() : [],
    pruned,
    skills: candidates.map(candidate => ({
      name: candidate.skillName,
      tool_name: candidate.toolName,
      target: candidate.targetDir,
    })),
  }, null, 2)}\n`)
}

if (import.meta.main) await main()
