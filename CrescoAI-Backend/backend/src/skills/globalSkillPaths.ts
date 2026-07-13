import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GLOBAL_SKILLS_ROOT = fileURLToPath(
  new URL('../../../../skills/', import.meta.url),
)

/** Application-owned skills that are intentionally public to all users. */
export function getGlobalSkillsRoot(): string {
  return GLOBAL_SKILLS_ROOT
}

/** Resolve one packaged skill without accepting path traversal as a name. */
export function getGlobalSkillRoot(skillName: string): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(skillName)) {
    throw new Error(`Invalid global skill name: ${skillName}`)
  }
  return join(GLOBAL_SKILLS_ROOT, skillName)
}

