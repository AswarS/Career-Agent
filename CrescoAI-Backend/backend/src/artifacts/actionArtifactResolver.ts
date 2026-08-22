import { readFile, readdir, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod/v4'
import {
  ACTION_ARTIFACT_INDEX_SUFFIX,
  isPathInsideWorkspace,
  toArtifactRef,
  type ActionArtifactIndex,
} from './actionArtifactPublisher.js'
import type { JsonValue } from '../skills/skillLifecycleTypes.js'

const ARTIFACT_REF = /^artifact:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
const indexSchema = z.strictObject({
  artifact_uid: z.string().uuid(), artifact_ref: z.string(),
  artifact_type: z.string().trim().min(1), schema_version: z.string().trim().min(1),
  status: z.enum(['ready', 'canonical_only']), canonical_path: z.string().trim().min(1),
  presentation_path: z.string().trim().min(1).optional(), user_id: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
})
const envelopeSchema = z.object({
  schema_version: z.string().trim().min(1),
  artifact_type: z.string().trim().min(1),
}).passthrough()

export type ResolvedArtifact = {
  artifactRef: string; artifactUid: string; artifactType: string; schemaVersion: string
  canonical: JsonValue; canonicalPath: string; presentationPath?: string; index: ActionArtifactIndex
}

export class ArtifactResolutionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message); this.name = 'ArtifactResolutionError'
  }
}

export function parseArtifactRef(artifactRef: string): string {
  const match = ARTIFACT_REF.exec(artifactRef.trim())
  if (!match) throw new ArtifactResolutionError('INVALID_ARTIFACT_REF', 'Invalid artifact reference')
  return match[1]!.toLowerCase()
}

function normalizeArtifactType(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function artifactTypesEquivalent(left: string, right: string): boolean {
  return normalizeArtifactType(left) === normalizeArtifactType(right)
}

export async function resolveArtifactForWorkspace(input: {
  userId: string; workspaceDir: string; artifactRef: string; expectedType?: string
  supportedSchemaVersions?: readonly string[]
}): Promise<ResolvedArtifact> {
  const uid = parseArtifactRef(input.artifactRef)
  const workspace = await realpath(resolve(input.workspaceDir)).catch(() => resolve(input.workspaceDir))
  const artifactDir = join(workspace, 'action_artifacts')
  const names = await readdir(artifactDir).catch(() => [] as string[])
  const suffix = `-${uid}${ACTION_ARTIFACT_INDEX_SUFFIX}`
  const candidates = names.filter(name => name.toLowerCase().endsWith(suffix))
  if (candidates.length !== 1) throw new ArtifactResolutionError('ARTIFACT_NOT_FOUND', 'Artifact not found')

  let index: ActionArtifactIndex
  try {
    index = indexSchema.parse(JSON.parse(await readFile(join(artifactDir, candidates[0]!), 'utf8')))
  } catch {
    throw new ArtifactResolutionError('INVALID_ARTIFACT_MANIFEST', 'Artifact manifest is invalid')
  }
  if (index.artifact_uid.toLowerCase() !== uid || index.artifact_ref.toLowerCase() !== toArtifactRef(uid) || index.user_id !== input.userId) {
    throw new ArtifactResolutionError('ARTIFACT_OWNERSHIP_MISMATCH', 'Artifact is not available to the current user')
  }
  if (input.expectedType && !artifactTypesEquivalent(index.artifact_type, input.expectedType)) {
    throw new ArtifactResolutionError('ARTIFACT_TYPE_MISMATCH', 'Artifact type does not match the required type')
  }
  if (input.supportedSchemaVersions && !input.supportedSchemaVersions.includes(index.schema_version)) {
    throw new ArtifactResolutionError('UNSUPPORTED_ARTIFACT_SCHEMA', 'Artifact schema version is not supported')
  }
  const canonicalPath = await realpath(index.canonical_path).catch(() => '')
  if (!canonicalPath || !isPathInsideWorkspace(workspace, canonicalPath)) {
    throw new ArtifactResolutionError('INVALID_ARTIFACT_PATH', 'Artifact content is unavailable')
  }
  if (index.presentation_path) {
    const presentationPath = await realpath(index.presentation_path).catch(() => '')
    if (!presentationPath || !isPathInsideWorkspace(workspace, presentationPath)) {
      throw new ArtifactResolutionError('INVALID_ARTIFACT_PATH', 'Artifact presentation is unavailable')
    }
  }
  let canonical: JsonValue
  try {
    canonical = JSON.parse(await readFile(canonicalPath, 'utf8')) as JsonValue
    const envelope = envelopeSchema.parse(canonical)
    if (!artifactTypesEquivalent(envelope.artifact_type, index.artifact_type) || envelope.schema_version !== index.schema_version) throw new Error('mismatch')
  } catch {
    throw new ArtifactResolutionError('INVALID_ARTIFACT_CONTENT', 'Artifact content does not match its manifest')
  }
  return { artifactRef: toArtifactRef(uid), artifactUid: uid, artifactType: index.artifact_type,
    schemaVersion: index.schema_version, canonical, canonicalPath,
    ...(index.presentation_path ? { presentationPath: index.presentation_path } : {}), index }
}
