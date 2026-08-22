import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { publishActionArtifact } from '../src/artifacts/actionArtifactPublisher.js'
import { ArtifactResolutionError, artifactTypesEquivalent, parseArtifactRef, resolveArtifactForWorkspace } from '../src/artifacts/actionArtifactResolver.js'

const completion = { skill_call_id: 'call-1', skill_name: 'test', agent_id: 'agent-1',
  outcome: 'success' as const, summary: 'done', result: {}, completed_at: new Date().toISOString() }
const adapter = { artifactType: 'TestArtifact', artifactSlug: 'test-artifact', schemaVersion: '1.0',
  toCanonical: () => ({ schema_version: '1.0', artifact_type: 'TestArtifact', created_at: new Date().toISOString(), lineage: { skill_call_id: 'call-1', skill_name: 'test', agent_id: 'agent-1' }, model: { ok: true } }),
  render: () => ({ title: 'Test', summary: 'Test', renderMode: 'html' as const, html: '<p>Test</p>' }) }

describe('ArtifactResolver', () => {
  test('treats canonical PascalCase and UI kebab-case as the same logical artifact type', () => {
    expect(artifactTypesEquivalent('LearningPlan', 'learning-plan')).toBe(true)
    expect(artifactTypesEquivalent('BaselineAssessment', 'baseline-assessment')).toBe(true)
    expect(artifactTypesEquivalent('LearningPlan', 'BaselineAssessment')).toBe(false)
  })
  test('resolves a same-turn artifact by opaque ref and validates ownership/type', async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'artifact-resolver-'))
    const publication = await publishActionArtifact({ completion, adapter, workspaceDir, sessionId: 'session-1', userId: 'user1' })
    expect(publication?.artifact_ref).toBe(`artifact://${publication?.artifact_uid}`)
    const resolved = await resolveArtifactForWorkspace({ userId: 'user1', workspaceDir, artifactRef: publication!.artifact_ref, expectedType: 'TestArtifact', supportedSchemaVersions: ['1.0'] })
    expect(resolved.artifactUid).toBe(publication!.artifact_uid)
    expect(resolved.artifactType).toBe('TestArtifact')
  })
  test('rejects malformed refs, cross-user access, type mismatch, and content tampering', async () => {
    expect(() => parseArtifactRef('/tmp/file.json')).toThrow(ArtifactResolutionError)
    const workspaceDir = await mkdtemp(join(tmpdir(), 'artifact-resolver-'))
    const publication = await publishActionArtifact({ completion, adapter, workspaceDir, sessionId: 'session-1', userId: 'user1' })
    await expect(resolveArtifactForWorkspace({ userId: 'user2', workspaceDir, artifactRef: publication!.artifact_ref })).rejects.toMatchObject({ code: 'ARTIFACT_OWNERSHIP_MISMATCH' })
    await expect(resolveArtifactForWorkspace({ userId: 'user1', workspaceDir, artifactRef: publication!.artifact_ref, expectedType: 'Other' })).rejects.toMatchObject({ code: 'ARTIFACT_TYPE_MISMATCH' })
    await writeFile(publication!.canonical_path!, JSON.stringify({ schema_version: '1.0', artifact_type: 'Other' }))
    await expect(resolveArtifactForWorkspace({ userId: 'user1', workspaceDir, artifactRef: publication!.artifact_ref })).rejects.toMatchObject({ code: 'INVALID_ARTIFACT_CONTENT' })
  })
  test('rejects a canonical symlink escaping the workspace', async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'artifact-resolver-'))
    const outside = await mkdtemp(join(tmpdir(), 'artifact-outside-'))
    const publication = await publishActionArtifact({ completion, adapter, workspaceDir, sessionId: 'session-1', userId: 'user1' })
    const original = JSON.parse(await readFile(publication!.canonical_path!, 'utf8'))
    await writeFile(join(outside, 'content.json'), JSON.stringify(original))
    await unlink(publication!.canonical_path!)
    await symlink(join(outside, 'content.json'), publication!.canonical_path!)
    await expect(resolveArtifactForWorkspace({ userId: 'user1', workspaceDir, artifactRef: publication!.artifact_ref })).rejects.toMatchObject({ code: 'INVALID_ARTIFACT_PATH' })
  })
})
