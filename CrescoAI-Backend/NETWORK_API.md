# Network API and Artifact Contract

本文档记录 `backend/src/Network` 当前实现给前端和 agent 侧使用的接口约定。

## 上传文件

### POST `/api/career-agent/threads/:id/files`

请求类型：`multipart/form-data`

字段：

- `file`: 必填，上传文件本体。

限制：

- 单文件最大 `20MB`。
- 控制器使用 `memoryStorage()` 接收，业务层校验通过后再落盘。
- 白名单扩展名：`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.mp4`, `.txt`, `.md`, `.pdf`, `.doc`, `.docx`。
- MIME 白名单按扩展名校验；`application/octet-stream` 可作为泛 MIME 兼容，但仍必须通过扩展名和文件内容校验。
- 内容校验包含常见 magic number / 文件结构检查：图片、mp4、pdf、doc、docx 按签名检查，txt/md 检查二进制控制字符比例。

存储：

- 文件目录：`backend/src/Network/files/{userId}/{conversationId}/`
- 文件名：`{timestamp}-{uuid}.{ext}`
- 清单文件：`backend/src/Network/files/{userId}/{conversationId}/_manifest.json`
- 稳定存储 URL：`/api/career-agent/threads/{conversationId}/files/{storedFileName}`
- 前端 GET 下载 URL：`/api/career-agent/threads/{conversationId}/files/{storedFileName}?download_token={token}`。`download_token` 由 Network 动态生成，仅用于浏览器直接 GET 下载，不写入 `_manifest.json`、`messages` 或 `resources`。

返回示例：

```json
{
  "asset_id": "asset-...",
  "assetId": "asset-...",
  "kind": "image",
  "url": "/api/career-agent/threads/{conversationId}/files/{storedFileName}?download_token={token}",
  "download_url": "/api/career-agent/threads/{conversationId}/files/{storedFileName}?download_token={token}",
  "downloadUrl": "/api/career-agent/threads/{conversationId}/files/{storedFileName}?download_token={token}",
  "title": "avatar.png",
  "mime_type": "image/png",
  "mimeType": "image/png",
  "size_bytes": 12345,
  "sizeBytes": 12345,
  "storage_path": "./src/Network/files/{userId}/{conversationId}/{storedFileName}",
  "storagePath": "./src/Network/files/{userId}/{conversationId}/{storedFileName}",
  "stored_file_name": "{storedFileName}",
  "storedFileName": "{storedFileName}",
  "original_name": "avatar.png",
  "originalName": "avatar.png"
}
```

### GET `/api/career-agent/threads/:id/files/:fileName`

返回已上传文件。接口会校验会话所有权，并设置原始文件名的 inline `Content-Disposition`。

## 发送消息

### POST `/api/career-agent/threads/:id/messages`

请求类型：`application/json`

常用字段：

```json
{
  "content": "请分析这份简历",
  "kind": "markdown",
  "attachment_asset_ids": ["asset-..."],
  "client_request_id": "req-..."
}
```

响应新增/保持字段：

```json
{
  "accepted": true,
  "status": "done",
  "conversation_id": "...",
  "conversationId": "...",
  "message_id": "msg_user_...",
  "messageId": "msg_user_...",
  "assistant_message_id": "msg_assistant_...",
  "assistantMessageId": "msg_assistant_...",
  "reply": "最终回复文本",
  "reasoning": "思考轨迹文本，若 agent/skill 产生 thinking 则返回",
  "media": [
    {
      "id": "asset-...",
      "kind": "html",
      "url": "/api/career-agent/generated/1/html/page.html",
      "title": "page.html",
      "artifact_id": "12",
      "artifactId": "12",
      "storage_path": "C:/.../html_generated/page.html",
      "storagePath": "C:/.../html_generated/page.html"
    }
  ],
  "actions": [
    {
      "id": "action-open-artifact-12",
      "kind": "open_artifact",
      "label": "打开页面",
      "artifact_id": "12",
      "artifactId": "12",
      "view_mode": "focus",
      "viewMode": "focus"
    }
  ],
  "raw": {}
}
```

说明：

- `reasoning` 只包含 thinking 内容，不包含 tool 调用参数或 tool 返回结果。
- `media` 表示 assistant 本次生成并可展示的多模态资源。
- `actions` 当前用于 `app`、`html`、`file` 类型工件的打开动作；图片、音频、视频通常由前端按 `media.kind` 直接渲染。

## 消息列表

### GET `/api/career-agent/threads/:id/messages`

返回会话消息数组。assistant 消息字段：

- `content`: 最终回复文本。
- `reasoning`: ReAct/thinking 轨迹文本。
- `media`: 绑定到该 message 的资源。
- `actions`: 打开 artifact 等 UI 动作。

Network 读取 runtime JSONL 时会合并相同 assistant message id 的 thinking 与 text 事件：

- 保留 `thinking` 为 `reasoning`。
- 保留 `text` 为 `content`。
- 过滤 `tool_use`、`tool_result`、`server_tool_use`、`mcp_tool_use` 等工具块。
- user 侧由工具返回产生的 `tool_result` 事件不会展示成普通用户消息。

## Agent/Skill 多模态输出约定

Network 支持 agent 或 skill 返回以下结构：

```ts
interface GeneratedFile {
  path?: string;
  url?: string;
  kind: 'image' | 'audio' | 'video' | 'html' | 'app' | 'file';
  title?: string;
  mimeType?: string;
  sizeBytes?: number;
}
```

来源：

- agent 普通回复：`AgentSendMessageResult.generatedFiles`
- skill 调用：`SkillHandlerResult.outputFiles`
- 兼容旧字段：`AgentSendMessageResult.file`
- 如果 `url` 是 `http(s)` 地址，Network 会保留该 URL 并创建 artifact；这适用于 agent 启动 app 后直接返回可访问地址的场景。

本地生成目录扫描：

- `backend/src/Network/user/{userId}/image_generated`
- `backend/src/Network/user/{userId}/audio_generated`
- `backend/src/Network/user/{userId}/video_generated`
- `backend/src/Network/user/{userId}/html_generated`
- `backend/src/Network/user/{userId}/app_generated`

公开访问：

- 单文件：`GET /api/career-agent/generated/:userId/:kind/:filename`
- 支持的单文件 `kind`: `image`, `audio`, `video`, `html`
- App 目录：`GET /api/career-agent/generated/:userId/app/:appId/*`

## Artifact 存储

assistant 生成资源会创建 artifact，并通过 message-resource 映射绑定到对应 assistant message。

`artifacts` 新增/使用字段：

- `conversationId`
- `messageId`
- `type`
- `kind`
- `title`
- `renderMode`
- `payloadPath`
- `url`
- `storagePath`
- `mimeType`
- `sizeBytes`
- `metadataJson`

`resources` 新增/使用字段：

- `artifactId`

绑定逻辑：

1. assistant 生成资源映射为 `media`。
2. 为每个 `media` 创建 artifact。
3. 将 `artifact_id/artifactId` 写回 `media`。
4. 将 `media` 写入 `resources` 表，绑定 `conversationId + messageId`。
5. 对 `app/html/file` 生成 `open_artifact` action，并回写 runtime JSONL 中同一个 assistant message。
