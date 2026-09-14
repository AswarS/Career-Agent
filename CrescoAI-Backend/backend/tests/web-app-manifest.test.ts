import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAppArtifactMetadata,
  readWebAppManifest,
  webAppManifestSchema,
} from '../src/artifacts/webAppManifest.js'

const validManifest = {
  schema: 'web-app-manifest/1.0',
  app_slug: 'fraction-practice',
  title: '分数加减法练习',
  telemetry: {
    events: ['attempt_submitted', 'hint_requested'],
    retention: 'local-session',
    upload: { endpoint: './events' },
  },
}

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })),
  )
})

describe('web-app-manifest schema', () => {
  test('accepts a valid v1.0 manifest', () => {
    expect(webAppManifestSchema.safeParse(validManifest).success).toBe(true)
  })

  test('rejects a wrong schema tag', () => {
    const result = webAppManifestSchema.safeParse({
      ...validManifest,
      schema: 'web-app-manifest/9.9',
    })
    expect(result.success).toBe(false)
  })

  test('rejects a malformed app slug', () => {
    expect(
      webAppManifestSchema.safeParse({ ...validManifest, app_slug: 'Bad Slug!' })
        .success,
    ).toBe(false)
  })

  test('rejects non-allowlisted telemetry event types', () => {
    expect(
      webAppManifestSchema.safeParse({
        ...validManifest,
        telemetry: { ...validManifest.telemetry, events: ['Bad Type!'] },
      }).success,
    ).toBe(false)
  })

  test('accepts lineage for iterated versions', () => {
    const result = webAppManifestSchema.safeParse({
      ...validManifest,
      lineage: {
        logical_object_type: 'web_app',
        logical_object_id: 'fraction-practice',
        version: 2,
        previous_artifact_ref: 'artifact://web-app-abc123',
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('readWebAppManifest', () => {
  test('reads a valid output.json from an app directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'web-app-manifest-'))
    temporaryRoots.push(dir)
    await writeFile(join(dir, 'output.json'), JSON.stringify(validManifest), 'utf8')
    expect(await readWebAppManifest(dir)).toMatchObject({
      app_slug: 'fraction-practice',
    })
  })

  test('returns undefined for missing or invalid output.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'web-app-manifest-'))
    temporaryRoots.push(dir)
    expect(await readWebAppManifest(dir)).toBeUndefined()
    await writeFile(join(dir, 'output.json'), 'not json', 'utf8')
    expect(await readWebAppManifest(dir)).toBeUndefined()
    await writeFile(join(dir, 'output.json'), '{"schema":"nope"}', 'utf8')
    expect(await readWebAppManifest(dir)).toBeUndefined()
  })
})

describe('buildAppArtifactMetadata', () => {
  test('carries the version chain and telemetry into artifact metadata', () => {
    const manifest = webAppManifestSchema.parse({
      ...validManifest,
      lineage: {
        logical_object_type: 'web_app',
        logical_object_id: 'fraction-practice',
        version: 2,
        previous_artifact_ref: 'artifact://web-app-abc123',
      },
    })
    const metadata = buildAppArtifactMetadata(manifest, 'web-app-def456')
    expect(metadata).toEqual({
      schema: 'web-app-manifest/1.0',
      artifact_uid: 'web-app-def456',
      artifact_type: 'generated-app',
      app_id: 'web-app-def456',
      app_slug: 'fraction-practice',
      title: '分数加减法练习',
      logical_object_type: 'web_app',
      logical_object_id: 'fraction-practice',
      version: 2,
      previous_artifact_ref: 'artifact://web-app-abc123',
      telemetry: { events: ['attempt_submitted', 'hint_requested'] },
    })
  })

  test('defaults to version 1 and the slug as logical id', () => {
    const manifest = webAppManifestSchema.parse(validManifest)
    const metadata = buildAppArtifactMetadata(manifest, 'web-app-one')
    expect(metadata.version).toBe(1)
    expect(metadata.logical_object_id).toBe('fraction-practice')
    expect(metadata.previous_artifact_ref).toBeUndefined()
  })
})
