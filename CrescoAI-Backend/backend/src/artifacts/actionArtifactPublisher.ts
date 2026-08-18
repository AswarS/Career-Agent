import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { z } from 'zod/v4'
import type { JsonValue } from '../skills/skillLifecycleTypes.js'

export type ActionCompletionForArtifact = {
  skill_call_id: string
  skill_name: string
  agent_id: string
  outcome: 'success' | 'insufficient_input' | 'error'
  summary: string
  result?: JsonValue
  completed_at: string
}

export type ArtifactPresentation = {
  title: string
  summary: string
  renderMode: 'html'
  html: string
}

export type ActionArtifactAdapter<TCanonical extends JsonValue> = {
  artifactType: string
  artifactSlug: string
  schemaVersion: string
  toCanonical(
    completion: ActionCompletionForArtifact,
  ): TCanonical | Promise<TCanonical>
  render(artifact: TCanonical): ArtifactPresentation
}

const actionArtifactManifestSchema = z.strictObject({
  artifact_uid: z.string().uuid(),
  artifact_type: z.string().trim().min(1),
  schema_version: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string(),
  canonical_path: z.string().trim().min(1),
  presentation_path: z.string().trim().min(1),
  render_mode: z.literal('html'),
  skill_call_id: z.string().trim().min(1),
  skill_name: z.string().trim().min(1),
  agent_id: z.string().trim().min(1),
  session_id: z.string().trim().min(1),
  user_id: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
})

export type ActionArtifactManifest = z.infer<
  typeof actionArtifactManifestSchema
>

export type ActionArtifactPublication = {
  artifact_uid: string
  artifact_type: string
  schema_version: string
  status: 'ready' | 'canonical_only' | 'error'
  canonical_path?: string
  presentation_path?: string
  render_mode?: 'html'
  error?: string
}

export const ACTION_ARTIFACT_MANIFEST_SUFFIX = '.artifact.json'

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replaceAll(/[/\\][^\s]+/g, '[path]').slice(0, 500)
}

function assertSafeSlug(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error(`Invalid artifact slug ${JSON.stringify(value)}`)
  }
}

export function isPathInsideWorkspace(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root)
  const normalizedCandidate = resolve(candidate)
  const pathFromRoot = relative(normalizedRoot, normalizedCandidate)
  return (
    pathFromRoot === '' ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
  )
}

export async function readActionArtifactManifest(
  presentationPath: string,
  workspaceDir: string,
): Promise<ActionArtifactManifest | undefined> {
  try {
    const source = await readFile(
      `${presentationPath}${ACTION_ARTIFACT_MANIFEST_SUFFIX}`,
      'utf8',
    )
    const manifest = actionArtifactManifestSchema.parse(JSON.parse(source))
    if (
      normalize(manifest.presentation_path) !== normalize(presentationPath) ||
      !isPathInsideWorkspace(workspaceDir, manifest.presentation_path) ||
      !isPathInsideWorkspace(workspaceDir, manifest.canonical_path)
    ) {
      return undefined
    }
    return manifest
  } catch {
    return undefined
  }
}

export async function publishActionArtifact<TCanonical extends JsonValue>(input: {
  completion: ActionCompletionForArtifact
  adapter: ActionArtifactAdapter<TCanonical>
  workspaceDir: string
  sessionId: string
  userId?: string | null
}): Promise<ActionArtifactPublication | undefined> {
  if (input.completion.outcome !== 'success') return undefined

  const artifactUid = randomUUID()
  const workspaceDir = resolve(input.workspaceDir)
  assertSafeSlug(input.adapter.artifactSlug)

  let canonical: TCanonical
  try {
    canonical = await input.adapter.toCanonical(input.completion)
  } catch (error) {
    return {
      artifact_uid: artifactUid,
      artifact_type: input.adapter.artifactType,
      schema_version: input.adapter.schemaVersion,
      status: 'error',
      error: safeError(error),
    }
  }

  const canonicalDir = join(workspaceDir, 'action_artifacts')
  const presentationDir = join(workspaceDir, 'html_generated')
  const canonicalPath = join(
    canonicalDir,
    `${input.adapter.artifactSlug}-${artifactUid}.json`,
  )
  const presentationPath = join(
    presentationDir,
    `${input.adapter.artifactSlug}-${artifactUid}.html`,
  )

  try {
    await mkdir(canonicalDir, { recursive: true })
    await mkdir(presentationDir, { recursive: true })
    const serialized = `${JSON.stringify(canonical, null, 2)}\n`
    JSON.parse(serialized)
    await writeFile(canonicalPath, serialized, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    return {
      artifact_uid: artifactUid,
      artifact_type: input.adapter.artifactType,
      schema_version: input.adapter.schemaVersion,
      status: 'error',
      error: safeError(error),
    }
  }

  let presentation: ArtifactPresentation
  try {
    presentation = input.adapter.render(canonical)
    if (!presentation.html.trim()) {
      throw new Error('Artifact adapter returned empty HTML')
    }
    await writeFile(presentationPath, presentation.html, {
      encoding: 'utf8',
      flag: 'wx',
    })

    const manifest: ActionArtifactManifest = {
      artifact_uid: artifactUid,
      artifact_type: input.adapter.artifactType,
      schema_version: input.adapter.schemaVersion,
      title: presentation.title,
      summary: presentation.summary,
      canonical_path: canonicalPath,
      presentation_path: presentationPath,
      render_mode: presentation.renderMode,
      skill_call_id: input.completion.skill_call_id,
      skill_name: input.completion.skill_name,
      agent_id: input.completion.agent_id,
      session_id: input.sessionId,
      user_id: input.userId ?? null,
      created_at: new Date().toISOString(),
    }
    await writeFile(
      `${presentationPath}${ACTION_ARTIFACT_MANIFEST_SUFFIX}`,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    )
  } catch (error) {
    return {
      artifact_uid: artifactUid,
      artifact_type: input.adapter.artifactType,
      schema_version: input.adapter.schemaVersion,
      status: 'canonical_only',
      canonical_path: canonicalPath,
      error: safeError(error),
    }
  }

  return {
    artifact_uid: artifactUid,
    artifact_type: input.adapter.artifactType,
    schema_version: input.adapter.schemaVersion,
    status: 'ready',
    canonical_path: canonicalPath,
    presentation_path: presentationPath,
    render_mode: 'html',
  }
}
