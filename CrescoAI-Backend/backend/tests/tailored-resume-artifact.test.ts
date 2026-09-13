import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishActionArtifact } from '../src/artifacts/actionArtifactPublisher.js'
import {
  TailoredResumeArtifactAdapter,
  validateTailoredResumeSkillResult,
} from '../src/tools/TailoredResumeGeneratorTool/artifactAdapter.js'

function validResult() {
  return {
    tailored_resume: {
      document_title: '张三 · 数据分析师简历',
      candidate: {
        name: '张三',
        headline: '数据分析方向',
        contact_lines: ['zhangsan@example.com', '上海'],
      },
      professional_summary: '具备 Python 数据处理和课程项目经验。',
      sections: [{
        section_type: 'projects',
        title: '项目经历',
        entries: [{
          heading: '用户行为分析课程项目',
          subheading: '课程项目',
          date: '2025',
          location: '',
          bullets: [{
            text: '使用 Python 清洗并分析课程数据集。',
            source_refs: ['application_materials.projects[0]'],
          }],
        }],
      }],
      match_analysis: [{
        requirement: 'Python 数据处理',
        status: 'matched',
        source_refs: ['application_materials.projects[0]'],
        note: '项目材料明确说明使用 Python。',
      }],
      facts_needing_confirmation: [],
      fact_boundary_declaration: '仅使用用户提供材料中的事实。',
    },
  }
}

describe('TailoredResume artifact publisher', () => {
  test('rejects a resume bullet without a source reference', () => {
    const result = validResult()
    result.tailored_resume.sections[0]!.entries[0]!.bullets[0]!.source_refs = []

    const validation = validateTailoredResumeSkillResult(result)

    expect(validation.ok).toBe(false)
    if ('error' in validation) expect(validation.error).toContain('source_refs')
  })

  test('publishes canonical JSON and an escaped printable HTML resume', async () => {
    const workspaceDir = await mkdtemp(join(tmpdir(), 'tailored-resume-'))
    const result = validResult()
    result.tailored_resume.sections[0]!.entries[0]!.bullets[0]!.text =
      '分析 <script>alert("x")</script> 数据。'
    const publication = await publishActionArtifact({
      workspaceDir,
      sessionId: 'session-1',
      userId: 'user-1',
      completion: {
        skill_call_id: 'call-1',
        skill_name: 'tailored-resume-generator',
        agent_id: 'agent-1',
        outcome: 'success',
        summary: '简历已生成',
        completed_at: '2026-09-02T10:00:00.000Z',
        result,
      },
      adapter: TailoredResumeArtifactAdapter,
    })

    expect(publication?.status).toBe('ready')
    expect(publication?.artifact_ref).toMatch(/^artifact:\/\//)
    const canonical = JSON.parse(await readFile(publication!.canonical_path!, 'utf8'))
    expect(canonical.artifact_type).toBe('TailoredResume')
    const html = await readFile(publication!.presentation_path!, 'utf8')
    expect(html).toContain('张三 · 数据分析师简历')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('@media print')
    expect(html).not.toContain('facts_needing_confirmation')
  })
})
