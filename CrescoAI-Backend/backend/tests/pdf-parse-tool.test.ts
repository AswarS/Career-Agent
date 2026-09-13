import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolUseContext } from '../src/Tool.js'
import { ConversationService } from '../src/Network/modules/conversation/conversation.service.js'
import { PdfParseTool } from '../src/tools/PdfParseTool/PdfParseTool.js'
import { getAllBaseTools } from '../src/tools.js'
import { extractPdfText } from '../src/utils/pdfTextExtraction.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildTextPdf(pageTexts: string[]): Buffer {
  const fontObjectNumber = 3 + pageTexts.length * 2
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageTexts.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`,
  ]
  for (let index = 0; index < pageTexts.length; index += 1) {
    const pageObjectNumber = 3 + index * 2
    const contentObjectNumber = pageObjectNumber + 1
    const stream = `BT /F1 12 Tf 72 720 Td (${escapePdfText(pageTexts[index]!)}) Tj ET`
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
    )
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  let source = '%PDF-1.4\n'
  const offsets: number[] = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source, 'ascii'))
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(source, 'ascii')
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  source += offsets
    .slice(1)
    .map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(source, 'ascii')
}

async function fixturePdf(pageTexts: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'career-pdf-parse-'))
  temporaryRoots.push(root)
  const path = join(root, 'fixture.pdf')
  await writeFile(path, buildTextPdf(pageTexts))
  return path
}

describe('PDF.js parsing integration', () => {
  test('extracts page-marked text and honors a page range', async () => {
    const path = await fixturePdf(['Career summary page one', 'Verified project evidence page two'])
    const result = await extractPdfText(path, { firstPage: 2, lastPage: 2 })

    expect(result.pageCount).toBe(2)
    expect(result.firstPage).toBe(2)
    expect(result.lastPage).toBe(2)
    expect(result.text).toContain('[Page 2]')
    expect(result.text).toContain('Verified project evidence page two')
    expect(result.text).not.toContain('Career summary page one')
    expect(result.needsOcr).toBe(false)
  })

  test('marks image-only or empty-text PDFs as needing OCR', async () => {
    const path = await fixturePdf([''])
    const result = await extractPdfText(path)

    expect(result.pageCount).toBe(1)
    expect(result.characterCount).toBe(0)
    expect(result.needsOcr).toBe(true)
  })

  test('registers PdfParse as a deferred read-only Tool and returns bounded text', async () => {
    const path = await fixturePdf(['First page content', 'Second page content for tool parsing'])
    expect(getAllBaseTools()).toContain(PdfParseTool)
    expect(PdfParseTool.isReadOnly()).toBe(true)
    expect(PdfParseTool.shouldDefer).toBe(true)

    const response = await PdfParseTool.call(
      { file_path: path, pages: '2', max_chars: 5_000 },
      { abortController: new AbortController() } as ToolUseContext,
      async () => ({ behavior: 'allow', updatedInput: {} }),
    )

    expect(response.data).toMatchObject({
      page_count: 2,
      first_page: 2,
      last_page: 2,
      pages_extracted: 1,
      needs_ocr: false,
      extraction_method: 'pdfjs',
    })
    expect(response.data.text).toContain('Second page content for tool parsing')
  })

  test('injects parsed PDF text into the web attachment context', async () => {
    const path = await fixturePdf(['Resume PDF attachment evidence'])
    const service = Object.create(ConversationService.prototype) as ConversationService
    const descriptor = await (service as unknown as {
      describeAttachmentForModel(
        conversation: { userId: number; id: string },
        attachment: Record<string, unknown>,
      ): Promise<{ injectedText: string; forwardToAgent: boolean }>
    }).describeAttachmentForModel(
      { userId: 1, id: 'pdf-test-thread' },
      {
        id: 'pdf-asset',
        kind: 'file',
        title: 'resume.pdf',
        storage_path: path,
        mime_type: 'application/pdf',
      },
    )

    expect(descriptor.forwardToAgent).toBe(false)
    expect(descriptor.injectedText).toContain('[PDF attachment]')
    expect(descriptor.injectedText).toContain('extraction_method: pdfjs')
    expect(descriptor.injectedText).toContain('Resume PDF attachment evidence')
    expect(descriptor.injectedText).toContain('<parsed_content>')
  })

  test('rejects a renamed non-PDF before PDF.js receives it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'career-pdf-invalid-'))
    temporaryRoots.push(root)
    const path = join(root, 'invalid.pdf')
    await writeFile(path, 'not a pdf', 'utf8')

    await expect(extractPdfText(path)).rejects.toThrow('missing %PDF- header')
  })
})
