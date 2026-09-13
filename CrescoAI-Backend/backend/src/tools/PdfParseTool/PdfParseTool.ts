import { extname } from 'node:path'
import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { expandPath } from '../../utils/path.js'
import {
  PDF_TEXT_DEFAULT_MAX_CHARS,
  PDF_TEXT_MAX_PAGES,
  extractPdfText,
} from '../../utils/pdfTextExtraction.js'
import { checkReadPermissionForTool } from '../../utils/permissions/filesystem.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { matchWildcardPattern } from '../../utils/permissions/shellRuleMatching.js'
import { parsePDFPageRange } from '../../utils/pdfUtils.js'
import { DESCRIPTION, PDF_PARSE_TOOL_NAME } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    file_path: z.string().describe('Absolute or workspace-relative path to a PDF file'),
    pages: z
      .string()
      .optional()
      .describe(`Optional page range such as "1-5" or "3"; maximum ${PDF_TEXT_MAX_PAGES} pages`),
    max_chars: z
      .number()
      .int()
      .min(1_000)
      .max(PDF_TEXT_DEFAULT_MAX_CHARS)
      .optional()
      .describe(`Maximum extracted characters; default ${PDF_TEXT_DEFAULT_MAX_CHARS}`),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    file_path: z.string(),
    page_count: z.number(),
    first_page: z.number(),
    last_page: z.number(),
    pages_extracted: z.number(),
    character_count: z.number(),
    truncated: z.boolean(),
    needs_ocr: z.boolean(),
    extraction_method: z.literal('pdfjs'),
    text: z.string(),
    metadata: z.object({
      title: z.string().optional(),
      author: z.string().optional(),
      subject: z.string().optional(),
    }),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

export const PdfParseTool = buildTool({
  name: PDF_PARSE_TOOL_NAME,
  searchHint: 'parse and extract searchable text from a local or uploaded PDF by page range',
  maxResultSizeChars: 120_000,
  strict: true,
  shouldDefer: true,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return DESCRIPTION
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Parse PDF'
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return `${input.file_path}${input.pages ? ` pages ${input.pages}` : ''}`
  },
  getPath({ file_path }) {
    return file_path || getCwd()
  },
  backfillObservableInput(input) {
    if (typeof input.file_path === 'string') input.file_path = expandPath(input.file_path)
  },
  async preparePermissionMatcher({ file_path }) {
    return pattern => matchWildcardPattern(pattern, file_path)
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    return checkReadPermissionForTool(
      PdfParseTool,
      input,
      context.getAppState().toolPermissionContext,
    )
  },
  async validateInput({ file_path, pages }) {
    if (extname(file_path).toLowerCase() !== '.pdf') {
      return { result: false, message: 'PdfParse only accepts .pdf files.', errorCode: 1 }
    }
    if (pages) {
      const parsed = parsePDFPageRange(pages)
      if (!parsed || parsed.lastPage === Infinity) {
        return {
          result: false,
          message: 'Use a closed PDF page range such as "1-5" or "3".',
          errorCode: 2,
        }
      }
      if (parsed.lastPage - parsed.firstPage + 1 > PDF_TEXT_MAX_PAGES) {
        return {
          result: false,
          message: `PDF page range exceeds the ${PDF_TEXT_MAX_PAGES}-page limit.`,
          errorCode: 3,
        }
      }
    }
    return { result: true }
  },
  renderToolUseMessage(input) {
    return `Parse PDF ${input.file_path}`
  },
  renderToolUseErrorMessage() {
    return 'PDF parsing failed'
  },
  renderToolResultMessage(output) {
    return output.needs_ocr
      ? `PDF has ${output.page_count} page(s) but no usable text layer; OCR is needed.`
      : `Extracted ${output.character_count} characters from ${output.pages_extracted} PDF page(s).`
  },
  async call({ file_path, pages, max_chars }, { abortController }) {
    const parsedRange = pages ? parsePDFPageRange(pages) : null
    const resolvedPath = expandPath(file_path)
    const result = await extractPdfText(resolvedPath, {
      firstPage: parsedRange?.firstPage,
      lastPage: parsedRange?.lastPage,
      maxChars: max_chars,
      signal: abortController.signal,
    })
    return {
      data: {
        file_path: resolvedPath,
        page_count: result.pageCount,
        first_page: result.firstPage,
        last_page: result.lastPage,
        pages_extracted: result.pages.length,
        character_count: result.characterCount,
        truncated: result.truncated,
        needs_ocr: result.needsOcr,
        extraction_method: result.extractionMethod,
        text: result.text,
        metadata: result.metadata,
      },
    }
  },
} satisfies ToolDef<InputSchema, Output>)
