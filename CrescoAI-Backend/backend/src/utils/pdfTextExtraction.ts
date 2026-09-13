import { readFile } from 'node:fs/promises'

export const PDF_TEXT_MAX_FILE_BYTES = 20 * 1024 * 1024
export const PDF_TEXT_MAX_PAGES = 50
export const PDF_TEXT_DEFAULT_MAX_CHARS = 100_000

export type PdfTextPage = {
  page: number
  text: string
  characterCount: number
}

export type PdfTextExtractionResult = {
  pageCount: number
  firstPage: number
  lastPage: number
  pages: PdfTextPage[]
  text: string
  characterCount: number
  truncated: boolean
  needsOcr: boolean
  extractionMethod: 'pdfjs'
  metadata: {
    title?: string
    author?: string
    subject?: string
  }
}

export type PdfTextExtractionOptions = {
  firstPage?: number
  lastPage?: number
  maxChars?: number
  maxPages?: number
  signal?: AbortSignal
}

function abortError(): Error {
  const error = new Error('PDF text extraction was aborted')
  error.name = 'AbortError'
  return error
}

function normalizePageText(items: unknown[]): string {
  let output = ''
  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item)) continue
    const text = String((item as { str?: unknown }).str ?? '')
    if (!text) continue
    if (output && !/[\s\n]$/.test(output) && !/^\s/.test(text)) output += ' '
    output += text
    if ((item as { hasEOL?: unknown }).hasEOL === true) output += '\n'
  }
  return output
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function optionalMetadataValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export async function extractPdfText(
  filePath: string,
  options: PdfTextExtractionOptions = {},
): Promise<PdfTextExtractionResult> {
  const buffer = await readFile(filePath)
  if (buffer.length === 0) throw new Error('PDF file is empty')
  if (buffer.length > PDF_TEXT_MAX_FILE_BYTES) {
    throw new Error(`PDF exceeds the ${PDF_TEXT_MAX_FILE_BYTES}-byte local extraction limit`)
  }
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('File is not a valid PDF (missing %PDF- header)')
  }
  if (options.signal?.aborted) throw abortError()

  const maxChars = Math.max(1, options.maxChars ?? PDF_TEXT_DEFAULT_MAX_CHARS)
  const maxPages = Math.max(1, options.maxPages ?? PDF_TEXT_MAX_PAGES)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0,
  })

  try {
    const document = await loadingTask.promise
    const firstPage = options.firstPage ?? 1
    const requestedLastPage = options.lastPage ?? document.numPages
    const lastPage = Math.min(requestedLastPage, document.numPages)
    if (!Number.isInteger(firstPage) || firstPage < 1 || firstPage > document.numPages) {
      throw new Error(`PDF page ${firstPage} is outside the document range 1-${document.numPages}`)
    }
    if (!Number.isInteger(lastPage) || lastPage < firstPage) {
      throw new Error(`Invalid PDF page range ${firstPage}-${lastPage}`)
    }
    if (lastPage - firstPage + 1 > maxPages) {
      throw new Error(`PDF page range exceeds the ${maxPages}-page extraction limit`)
    }

    const pages: PdfTextPage[] = []
    const textParts: string[] = []
    let remainingChars = maxChars
    let truncated = false
    for (let pageNumber = firstPage; pageNumber <= lastPage; pageNumber += 1) {
      if (options.signal?.aborted) throw abortError()
      const page = await document.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const fullPageText = normalizePageText(textContent.items as unknown[])
      const pageText = fullPageText.slice(0, remainingChars)
      pages.push({
        page: pageNumber,
        text: pageText,
        characterCount: pageText.length,
      })
      textParts.push(`[Page ${pageNumber}]\n${pageText}`)
      remainingChars -= pageText.length
      page.cleanup()
      if (pageText.length < fullPageText.length || remainingChars <= 0) {
        truncated = pageNumber < lastPage || pageText.length < fullPageText.length
        break
      }
    }

    let info: Record<string, unknown> = {}
    try {
      const metadata = await document.getMetadata()
      if (metadata.info && typeof metadata.info === 'object') {
        info = metadata.info as unknown as Record<string, unknown>
      }
    } catch {
      // Metadata is optional and must not make otherwise-readable PDFs fail.
    }

    const text = textParts.join('\n\n').trim()
    const meaningfulText = pages.map(page => page.text).join('').replace(/\s/g, '')
    return {
      pageCount: document.numPages,
      firstPage,
      lastPage: pages.at(-1)?.page ?? firstPage,
      pages,
      text,
      characterCount: pages.reduce((sum, page) => sum + page.characterCount, 0),
      truncated,
      needsOcr: meaningfulText.length < 20,
      extractionMethod: 'pdfjs',
      metadata: {
        title: optionalMetadataValue(info.Title),
        author: optionalMetadataValue(info.Author),
        subject: optionalMetadataValue(info.Subject),
      },
    }
  } catch (error) {
    if (error instanceof Error && /password/i.test(`${error.name} ${error.message}`)) {
      throw new Error('PDF is password-protected and cannot be parsed locally', { cause: error })
    }
    throw error
  } finally {
    await loadingTask.destroy()
  }
}
