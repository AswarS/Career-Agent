import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod/v4'

/**
 * The canonical manifest contract for generated Web Apps (output.json).
 * The renderer writes it into the app directory; the Tool validates it on
 * delivery, discovery reads it for titles, and persistence derives the
 * artifact version-chain metadata from it.
 */

export const APP_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
export const APP_EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]{1,48}$/
/** Directory names produced by createWebAppOutputDirectory (uuid) or seeding. */
export const APP_ID_PATTERN = /^web-app-[0-9a-z-]{1,64}$/

export const webAppManifestSchema = z.strictObject({
  schema: z.literal('web-app-manifest/1.0'),
  app_slug: z.string().regex(APP_SLUG_PATTERN),
  title: z.string().trim().min(1),
  renderer_skill_version: z.string().trim().min(1).optional(),
  telemetry: z
    .strictObject({
      events: z.array(z.string().regex(APP_EVENT_TYPE_PATTERN)).max(64),
      agent_questions: z.array(z.string().min(1)).max(16).optional(),
      retention: z.literal('local-session'),
      upload: z
        .strictObject({
          // Relative to the app's own directory URL; never hardcode ids.
          endpoint: z.literal('./events'),
          batch_size: z.number().int().min(1).max(50).optional(),
          flush_interval_ms: z.number().int().min(1000).max(300_000).optional(),
        })
        .optional(),
    })
    .optional(),
  lineage: z
    .strictObject({
      logical_object_type: z.literal('web_app'),
      logical_object_id: z.string().trim().min(1),
      version: z.number().int().positive(),
      previous_artifact_ref: z.string().trim().min(1).optional(),
    })
    .optional(),
  delivery: z
    .strictObject({
      title: z.string().min(1).optional(),
      language: z.string().optional(),
      offline: z.literal(true).optional(),
    })
    .optional(),
}).passthrough()

export type WebAppManifest = z.infer<typeof webAppManifestSchema>

export function isValidWebAppManifest(value: unknown): value is WebAppManifest {
  return webAppManifestSchema.safeParse(value).success
}

/** Read and validate <appDir>/output.json; undefined on any failure. */
export async function readWebAppManifest(
  appDir: string,
): Promise<WebAppManifest | undefined> {
  try {
    const raw = JSON.parse(await readFile(join(appDir, 'output.json'), 'utf8'))
    const parsed = webAppManifestSchema.safeParse(raw)
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/**
 * Build the artifacts.metadataJson for a generated app. The version-chain
 * keys (logical_object_id / version / previous_artifact_ref / artifact_uid)
 * drive the existing listArtifacts latest-version projection, so they must be
 * written explicitly here — the action-artifact publisher path is not used
 * for kind='app'.
 */
export function buildAppArtifactMetadata(
  manifest: WebAppManifest,
  appId: string,
): Record<string, unknown> {
  const version = manifest.lineage?.version ?? 1
  const logicalObjectId = manifest.lineage?.logical_object_id ?? manifest.app_slug
  return {
    schema: 'web-app-manifest/1.0',
    artifact_uid: appId,
    artifact_type: 'generated-app',
    app_id: appId,
    app_slug: manifest.app_slug,
    title: manifest.title,
    logical_object_type: 'web_app',
    logical_object_id: logicalObjectId,
    version,
    ...(manifest.lineage?.previous_artifact_ref
      ? { previous_artifact_ref: manifest.lineage.previous_artifact_ref }
      : {}),
    ...(manifest.telemetry
      ? {
          telemetry: {
            events: manifest.telemetry.events,
            ...(manifest.telemetry.agent_questions
              ? { agent_questions: manifest.telemetry.agent_questions }
              : {}),
          },
        }
      : {}),
  }
}
