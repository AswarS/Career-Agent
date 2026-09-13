import { z } from 'zod/v4'
import type {
  ActionArtifactAdapter,
  ActionCompletionForArtifact,
} from '../../artifacts/actionArtifactPublisher.js'
import type { JsonValue } from '../../skills/skillLifecycleTypes.js'

const text = z.string()
const bulletSchema = z.object({
  text: z.string().trim().min(1),
  source_refs: z.array(z.string().trim().min(1)).min(1),
})
const entrySchema = z.object({
  heading: text,
  subheading: text,
  date: text,
  location: text,
  bullets: z.array(bulletSchema),
})
const sectionSchema = z.object({
  section_type: z.enum([
    'experience',
    'projects',
    'education',
    'skills',
    'certifications',
    'other',
  ]),
  title: z.string().trim().min(1),
  entries: z.array(entrySchema).min(1),
})

export const tailoredResumeSchema = z.object({
  document_title: z.string().trim().min(1),
  candidate: z.object({
    name: text,
    headline: text,
    contact_lines: z.array(text),
  }),
  professional_summary: text,
  sections: z.array(sectionSchema).min(1),
  match_analysis: z.array(z.object({
    requirement: z.string().trim().min(1),
    status: z.enum(['matched', 'partial', 'missing']),
    source_refs: z.array(text),
    note: text,
  })),
  facts_needing_confirmation: z.array(z.object({
    claim: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    source_refs: z.array(text),
  })),
  fact_boundary_declaration: z.string().trim().min(1),
})

type TailoredResume = z.infer<typeof tailoredResumeSchema>

export type TailoredResumeArtifact = {
  schema_version: '1.0'
  artifact_type: 'TailoredResume'
  created_at: string
  lineage: {
    skill_call_id: string
    skill_name: string
    agent_id: string
  }
  resume: TailoredResume
}

function resultValue(result: JsonValue | undefined): unknown {
  let value: unknown = result
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return value
    }
  }
  return (value as { tailored_resume?: unknown } | undefined)?.tailored_resume
}

export function validateTailoredResumeSkillResult(
  result: JsonValue | undefined,
): { ok: true } | { ok: false; error: string } {
  const parsed = tailoredResumeSchema.safeParse(resultValue(result))
  if (parsed.success) return { ok: true }
  const fields = [...new Set(parsed.error.issues.map(issue =>
    issue.path.length ? `tailored_resume.${issue.path.join('.')}` : 'tailored_resume',
  ))].slice(0, 10)
  return {
    ok: false,
    error: `Tailored resume result is incomplete or invalid at: ${fields.join(', ')}. Correct the structured result and call ReturnSkillResult again.`,
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderEntry(entry: TailoredResume['sections'][number]['entries'][number]): string {
  const meta = [entry.subheading, entry.location].filter(Boolean).map(escapeHtml).join(' · ')
  return `<article class="entry">
    <div class="entry-head"><div><h3>${escapeHtml(entry.heading)}</h3>${meta ? `<p>${meta}</p>` : ''}</div>${entry.date ? `<time>${escapeHtml(entry.date)}</time>` : ''}</div>
    ${entry.bullets.length ? `<ul>${entry.bullets.map(item => `<li>${escapeHtml(item.text)}</li>`).join('')}</ul>` : ''}
  </article>`
}

export function renderTailoredResumeHtml(resume: TailoredResume): string {
  const contacts = resume.candidate.contact_lines.filter(Boolean).map(escapeHtml).join(' · ')
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(resume.document_title)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, "Noto Sans SC", "Microsoft YaHei", sans-serif; color: #172033; background: #eef1f5; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; line-height: 1.48; }
    main { width: min(850px, 100%); margin: 0 auto; padding: 46px 54px; background: white; box-shadow: 0 12px 38px rgba(25, 34, 52, .12); }
    header { padding-bottom: 18px; border-bottom: 3px solid #263b63; }
    h1 { margin: 0; font-size: 32px; line-height: 1.15; }
    .headline { margin: 7px 0 0; color: #38547f; font-size: 17px; font-weight: 700; }
    .contact { margin: 8px 0 0; color: #556274; font-size: 13px; }
    .summary { margin: 18px 0 0; }
    section { margin-top: 23px; }
    h2 { margin: 0 0 7px; padding-bottom: 5px; border-bottom: 1px solid #aeb8c7; color: #263b63; font-size: 17px; letter-spacing: .04em; }
    .entry { padding: 9px 0 3px; }
    .entry-head { display: flex; justify-content: space-between; gap: 18px; align-items: baseline; }
    h3 { margin: 0; font-size: 15px; }
    .entry-head p, time { margin: 2px 0 0; color: #5c6879; font-size: 12px; }
    time { flex: 0 0 auto; }
    ul { margin: 7px 0 0; padding-left: 20px; }
    li { margin: 3px 0; }
    @media (max-width: 620px) { body { padding: 0; } main { padding: 28px 24px; box-shadow: none; } .entry-head { display: block; } }
    @media print { @page { size: A4; margin: 13mm; } body { padding: 0; background: white; } main { width: auto; padding: 0; box-shadow: none; } section, .entry { break-inside: avoid; } }
  </style>
</head>
<body><main>
  <header><h1>${escapeHtml(resume.candidate.name || resume.document_title)}</h1>${resume.candidate.headline ? `<p class="headline">${escapeHtml(resume.candidate.headline)}</p>` : ''}${contacts ? `<p class="contact">${contacts}</p>` : ''}</header>
  ${resume.professional_summary ? `<p class="summary">${escapeHtml(resume.professional_summary)}</p>` : ''}
  ${resume.sections.map(section => `<section><h2>${escapeHtml(section.title)}</h2>${section.entries.map(renderEntry).join('')}</section>`).join('')}
</main></body></html>`
}

function toCanonical(completion: ActionCompletionForArtifact): TailoredResumeArtifact {
  const resume = tailoredResumeSchema.parse(resultValue(completion.result))
  return {
    schema_version: '1.0',
    artifact_type: 'TailoredResume',
    created_at: completion.completed_at,
    lineage: {
      skill_call_id: completion.skill_call_id,
      skill_name: completion.skill_name,
      agent_id: completion.agent_id,
    },
    resume,
  }
}

export const TailoredResumeArtifactAdapter = {
  artifactType: 'TailoredResume',
  artifactSlug: 'tailored-resume',
  schemaVersion: '1.0',
  toCanonical,
  render(artifact) {
    return {
      title: artifact.resume.document_title,
      summary: `Generated tailored resume with ${artifact.resume.sections.length} section(s).`,
      renderMode: 'html',
      html: renderTailoredResumeHtml(artifact.resume),
    }
  },
} satisfies ActionArtifactAdapter<TailoredResumeArtifact & JsonValue>
