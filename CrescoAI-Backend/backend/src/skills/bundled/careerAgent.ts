import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FrontmatterData } from '../../utils/frontmatterParser.js'
import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { substituteArguments } from '../../utils/argumentSubstitution.js'
import { registerBundledSkill } from '../bundledSkills.js'

const GLOBAL_SKILLS_DIR = fileURLToPath(
  new URL('../../../../../skills/', import.meta.url),
)

export type GlobalDiskSkillCatalogEntry = {
  name: string
  description: string
  whenToUse: string
  argumentHint?: string
  argumentNames: string[]
  category: 'analysis'
}

let globalDiskSkillCatalogCache: GlobalDiskSkillCatalogEntry[] | undefined

function parseArgumentNames(frontmatter: FrontmatterData): string[] {
  const value = frontmatter.arguments
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : []
}

/**
 * Discover application-owned disk skills under the repository root `skills/`
 * directory. These are global skills, not user-authored skills, so every user
 * sees the same catalog.
 *
 * The metadata.json requirement keeps this dynamic scan limited to packaged
 * app-owned skills and avoids double-registering the few legacy skills that
 * still have explicit wrappers below.
 */
export function getGlobalDiskSkillCatalog(): GlobalDiskSkillCatalogEntry[] {
  if (globalDiskSkillCatalogCache) return [...globalDiskSkillCatalogCache]

  let entries: Dirent[]
  try {
    entries = readdirSync(GLOBAL_SKILLS_DIR, { withFileTypes: true })
  } catch {
    globalDiskSkillCatalogCache = []
    return []
  }

  globalDiskSkillCatalogCache = entries
    .filter(entry => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap(entry => {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(entry.name)) return []

      const skillDir = join(GLOBAL_SKILLS_DIR, entry.name)
      const metadataFile = join(skillDir, 'metadata.json')
      try {
        JSON.parse(readFileSync(metadataFile, 'utf8'))
      } catch {
        return []
      }

      const skillFile = join(skillDir, 'SKILL.md')
      let source: string
      try {
        source = readFileSync(skillFile, 'utf8')
      } catch {
        return []
      }

      const { frontmatter } = parseFrontmatter(source, skillFile)
      const frontmatterName =
        typeof frontmatter.name === 'string' ? frontmatter.name.trim() : ''
      const description =
        typeof frontmatter.description === 'string'
          ? frontmatter.description.trim()
          : ''
      if (
        (frontmatterName && frontmatterName !== entry.name) ||
        !description
      ) {
        return []
      }

      const argumentNames = parseArgumentNames(frontmatter)
      const argumentHint =
        typeof frontmatter['argument-hint'] === 'string'
          ? frontmatter['argument-hint'].trim()
          : argumentNames.length > 0
            ? argumentNames.map(name => `[${name}]`).join(' ')
            : undefined
      const whenToUse =
        typeof frontmatter.when_to_use === 'string' &&
        frontmatter.when_to_use.trim()
          ? frontmatter.when_to_use.trim()
          : description

      return [
        {
          name: entry.name,
          description,
          whenToUse,
          argumentHint,
          argumentNames,
          category: 'analysis' as const,
        },
      ]
    })

  return [...globalDiskSkillCatalogCache]
}

async function loadDiskSkillPrompt(
  skillsRoot: string,
  skillName: string,
  args: string,
): Promise<string> {
  const skillDir = join(skillsRoot, skillName)
  const skillFile = join(skillDir, 'SKILL.md')
  const source = await readFile(skillFile, 'utf8')
  const { frontmatter, content } = parseFrontmatter(source, skillFile)
  const argumentNames = parseArgumentNames(frontmatter)
  const expanded = substituteArguments(content.trim(), args, true, argumentNames)
    .replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir)

  return `Base directory for this skill: ${skillDir}\n\n${expanded}`
}

async function loadGlobalSkillPrompt(
  skillName: string,
  args: string,
): Promise<string> {
  return loadDiskSkillPrompt(GLOBAL_SKILLS_DIR, skillName, args)
}

export function registerCareerAgentSkills(): void {
  registerBundledSkill({
    name: 'learning-plan',
    description:
      'Create structured long-term learning plans, curricula, interview preparation roadmaps, and interactive learning app specifications.',
    whenToUse:
      'Use for study plans, learning paths, interview or exam preparation, course planning, skill improvement, and structured knowledge learning.',
    argumentHint: '[learning goal]',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [
        {
          type: 'text',
          text: await loadGlobalSkillPrompt('learning-plan', args),
        },
      ]
    },
  })

  registerBundledSkill({
    name: 'develop-web-game',
    description:
      'Build and validate interactive HTML applications, games, simulations, visual explanations, dashboards, animations, and algorithm demos.',
    whenToUse:
      'Use when interaction or visualization teaches better than plain text, especially for spatial, temporal, structural, quantitative, scientific, or process-oriented topics.',
    argumentHint: '[application description]',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [
        {
          type: 'text',
          text: await loadGlobalSkillPrompt('develop-web-game', args),
        },
      ]
    },
  })

  registerBundledSkill({
    name: 'code-analysis',
    description:
      'Analyze code for security vulnerabilities, correctness, performance, maintainability, and concrete improvements.',
    whenToUse:
      'Use when the user asks for code review, security analysis, performance analysis, or improvement suggestions.',
    argumentHint: '[code or review request]',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [
        {
          type: 'text',
          text:
            'Analyze the code or files requested by the user. Check correctness, security, performance, maintainability, and tests. ' +
            'Use repository tools to inspect relevant context when available. Report findings by severity with precise file locations and concrete fixes.' +
            (args ? `\n\nUser request:\n${args}` : ''),
        },
      ]
    },
  })

  registerBundledSkill({
    name: 'image-generation',
    description: 'Generate or edit images from a user description.',
    whenToUse:
      'Use when the user asks to create, edit, transform, or generate an image.',
    argumentHint: '[image description]',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [
        {
          type: 'text',
          text:
            'Use the ImageGenerate tool to complete the image request. Preserve the user intent and return the generated image result.' +
            (args ? `\n\nImage request:\n${args}` : ''),
        },
      ]
    },
  })

  registerBundledSkill({
    name: 'video-generation',
    description: 'Generate a video from a user description or source frame.',
    whenToUse:
      'Use when the user asks to create or generate a video, animation clip, or motion sequence.',
    argumentHint: '[video description]',
    userInvocable: true,
    async getPromptForCommand(args) {
      return [
        {
          type: 'text',
          text:
            'Use the VideoGenerate tool to complete the video request. Preserve requested duration, aspect ratio, audio, and source-frame constraints.' +
            (args ? `\n\nVideo request:\n${args}` : ''),
        },
      ]
    },
  })

  for (const skill of getGlobalDiskSkillCatalog()) {
    registerBundledSkill({
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse,
      argumentHint: skill.argumentHint,
      userInvocable: true,
      async getPromptForCommand(args) {
        return [
          {
            type: 'text',
            text: await loadDiskSkillPrompt(
              GLOBAL_SKILLS_DIR,
              skill.name,
              args,
            ),
          },
        ]
      },
    })
  }
}
