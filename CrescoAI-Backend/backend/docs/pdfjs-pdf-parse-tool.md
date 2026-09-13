# PDF.js PDF 解析工具接入说明

## 当前状态

后端已将 `pdfjs-dist` 接入为只读工具 `PdfParse`，同时用于网页会话中的 PDF 附件预解析。它可以读取带文本层的 PDF；纯扫描件不会伪造解析结果，而会返回 `needs_ocr: true`。

## 数据流

```text
网页上传 PDF
  -> ConversationService 校验附件
  -> pdfjs-dist 本地解析文本层
  -> 把受限长度的解析结果注入用户消息
  -> Agent 使用文本回答

Agent 主动读取工作区 PDF
  -> PdfParse(file_path, pages?, max_chars?)
  -> 文件读取权限检查
  -> pdfjs-dist 按页提取
  -> 返回页数、页码范围、文本、截断与 OCR 状态
```

网页路径先在服务端提取，是因为 OpenAI-compatible 消息适配器不保证支持原生 `document` 内容块。这样 Paratera、DeepSeek 等兼容接口也能收到 PDF 文本。

## 代码位置

- `src/utils/pdfTextExtraction.ts`：PDF.js 加载、页范围、字符上限、元数据和扫描件判断。
- `src/tools/PdfParseTool/PdfParseTool.ts`：Agent 工具定义、参数校验和文件权限检查。
- `src/tools/PdfParseTool/prompt.ts`：工具名称和模型可见说明。
- `src/tools.ts`：注册到基础工具池。
- `src/server/permissions.ts`：标记为只读工具。
- `src/Network/modules/conversation/conversation.service.ts`：网页 PDF 附件自动解析。
- `tests/pdf-parse-tool.test.ts`：文本、页范围、扫描件、注册和网页附件回归测试。

## 调用示例

```json
{
  "file_path": "D:/documents/resume.pdf",
  "pages": "1-5",
  "max_chars": 30000
}
```

参数约束：

- 文件必须是 `.pdf` 且具有 `%PDF-` 文件头。
- 单文件最大 20 MiB。
- 单次最多解析 50 页。
- 最多返回 100,000 个字符。
- 加密 PDF 会给出明确错误。
- `pdfjs-dist` 不包含 OCR；扫描件由 `needs_ocr` 明确标识，后续可以接入 OCRmyPDF、Tesseract 或云 OCR。

## 安装与验证

依赖已经写入 `package.json` 和 `bun.lock`：

```powershell
cd CrescoAI-Backend/backend
bun install
bun test tests/pdf-parse-tool.test.ts
bun run network-tools:artifacts:check
```

启动后端后无需单独启动 PDF 服务；`PdfParse` 会随基础工具池一起装载。
