# Career Agent API

本文档整理当前项目中已经实现的 Career Agent API 接口、请求字段、返回字段与存储约定。

当前接口实现主要位于：

- [conversation.controller.ts](C:\git\Career-Agent\backend\src\Network\modules\conversation\conversation.controller.ts)
- [conversation.service.ts](C:\git\Career-Agent\backend\src\Network\modules\conversation\conversation.service.ts)

## Base Path

所有接口统一挂载在：

```txt
/api/career-agent
```

## 已实现接口总览

1. `POST /api/career-agent/threads`
2. `GET /api/career-agent/threads/:id`
3. `GET /api/career-agent/threads/:id/messages`
4. `POST /api/career-agent/threads/:id/messages`
5. `POST /api/career-agent/threads/:id/files`
6. `GET /api/career-agent/threads/:id/files/:fileName`

## 数据存储约定

### 1. 会话元数据

存储在 SQLite：

```txt
backend/src/Network/data/app.sqlite
```

当前使用的表：

- `conversations`

字段定义见：

- [conversation.entity.ts](C:\git\Career-Agent\backend\src\Network\modules\conversation\entities\conversation.entity.ts)

### 2. 会话消息

消息历史不再存储在 SQLite，而是存储在：

```txt
backend/src/Network/user/{user_id}/{conversation_id}.json
```

例如：

```txt
backend/src/Network/user/1/12.json
```

### 3. 上传文件

上传文件存储在：

```txt
backend/src/Network/files/{conversation_id}/
```

例如：

```txt
backend/src/Network/files/12/
```

每个会话目录下文件名唯一，系统会自动生成不重复文件名。

### 4. 文件清单

每个会话目录下还有一个上传清单文件：

```txt
backend/src/Network/files/{conversation_id}/_manifest.json
```

该文件记录上传后的文件元数据，用于：

- 通过 `asset_id` 查找附件
- 在发送消息时把附件信息写入消息记录
- 通过文件名读取实际文件

## 数据模型

## ThreadSummary

用于会话列表和新建会话返回。

字段：

- `id`: `string`
- `title`: `string`
- `preview`: `string`
- `status`: `string`
- `updated_at`: `string`
- `updatedAt`: `string`

示例：

```json
{
  "id": "12",
  "title": "New Conversation",
  "preview": "",
  "status": "active",
  "updated_at": "2026-04-26T10:00:00.000Z",
  "updatedAt": "2026-04-26T10:00:00.000Z"
}
```

## ConversationMessage

用于会话消息列表。

字段：

- `id`: `string`
- `thread_id`: `string`
- `threadId`: `string`
- `role`: `'user' | 'assistant' | 'system'`
- `kind`: `string`
- `content`: `string`
- `reasoning`: `string`，可选
- `agent_id`: `string`，可选
- `agentId`: `string`，可选
- `agent_name`: `string`，可选
- `agentName`: `string`，可选
- `agent_accent`: `string`，可选
- `agentAccent`: `string`，可选
- `actions`: `MessageAction[]`，可选
- `media`: `MessageMedia[]`，可选
- `attachments`: `MessageMedia[]`，可选
- `client_request_id`: `string`，可选
- `clientRequestId`: `string`，可选
- `created_at`: `string`
- `createdAt`: `string`

## MessageAction

字段：

- `id`: `string`
- `kind`: `string`
- `label`: `string`
- `artifact_id`: `string`，可选
- `artifactId`: `string`，可选
- `view_mode`: `string`，可选
- `viewMode`: `string`，可选

## MessageMedia

字段：

- `id`: `string`
- `kind`: `'image' | 'video' | 'file'`
- `url`: `string`
- `title`: `string`，可选
- `caption`: `string`，可选
- `alt`: `string`，可选
- `mime_type`: `string`，可选
- `mimeType`: `string`，可选
- `storage_path`: `string`，可选
- `storagePath`: `string`，可选
- `size_bytes`: `number`，可选
- `sizeBytes`: `number`，可选
- `created_at`: `string`，可选
- `createdAt`: `string`，可选

## UploadedConversationFile

上传文件接口返回的文件对象。

字段：

- `asset_id`: `string`
- `assetId`: `string`
- `kind`: `'image' | 'video' | 'file'`
- `url`: `string`
- `title`: `string`
- `mime_type`: `string`
- `mimeType`: `string`
- `size_bytes`: `number`
- `sizeBytes`: `number`
- `created_at`: `string`
- `createdAt`: `string`
- `storage_path`: `string`
- `storagePath`: `string`
- `stored_file_name`: `string`
- `storedFileName`: `string`
- `original_name`: `string`
- `originalName`: `string`

## 接口详情

### 1. 新建会话

`POST /api/career-agent/threads`

请求头：

- `Content-Type: application/json`

请求体字段：

- `userId`: `number`，可选，默认 `1`
- `title`: `string`，可选
- `preview`: `string`，可选
- `status`: `'active' | 'archived'`，可选，默认 `active`
- `updatedAt`: `Date`，可选

请求示例：

```json
{
  "userId": 1,
  "title": "本周规划",
  "preview": "整理职业方向",
  "status": "active"
}
```

返回：

- `ThreadSummary`

返回示例：

```json
{
  "id": "12",
  "title": "本周规划",
  "preview": "整理职业方向",
  "status": "active",
  "updated_at": "2026-04-26T10:00:00.000Z",
  "updatedAt": "2026-04-26T10:00:00.000Z"
}
```

额外行为：

- 自动创建消息文件 `user/{userId}/{conversationId}.json`
- 自动创建文件清单 `files/{conversationId}/_manifest.json`

### 2. 获取某用户会话列表

`GET /api/career-agent/threads/:id`

说明：

- 当前实现里 `:id` 表示 `userId`
- 该接口返回该用户的会话列表

路径参数：

- `id`: `number`，用户 id

返回：

- `ThreadSummary[]`

返回示例：

```json
[
  {
    "id": "12",
    "title": "本周规划",
    "preview": "整理职业方向",
    "status": "active",
    "updated_at": "2026-04-26T10:00:00.000Z",
    "updatedAt": "2026-04-26T10:00:00.000Z"
  }
]
```

### 3. 获取会话消息历史

`GET /api/career-agent/threads/:id/messages`

路径参数：

- `id`: `number`，会话 id，即 `conversationId`

返回：

- `ConversationMessage[]`

返回示例：

```json
[
  {
    "id": "message-1",
    "thread_id": "12",
    "threadId": "12",
    "role": "user",
    "kind": "markdown",
    "content": "请帮我分析这份简历",
    "media": [
      {
        "id": "asset-1",
        "kind": "file",
        "url": "/api/career-agent/threads/12/files/1714123456789-uuid.pdf",
        "title": "resume.pdf",
        "mime_type": "application/pdf",
        "storage_path": "/api/career-agent/threads/12/files/1714123456789-uuid.pdf",
        "size_bytes": 245991,
        "created_at": "2026-04-26T10:05:00.000Z"
      }
    ],
    "attachments": [
      {
        "id": "asset-1",
        "kind": "file",
        "url": "/api/career-agent/threads/12/files/1714123456789-uuid.pdf",
        "title": "resume.pdf",
        "mime_type": "application/pdf",
        "storage_path": "/api/career-agent/threads/12/files/1714123456789-uuid.pdf",
        "size_bytes": 245991,
        "created_at": "2026-04-26T10:05:00.000Z"
      }
    ],
    "created_at": "2026-04-26T10:06:00.000Z",
    "createdAt": "2026-04-26T10:06:00.000Z"
  }
]
```

### 4. 发送多模态消息

`POST /api/career-agent/threads/:id/messages`

路径参数：

- `id`: `number`，会话 id，即 `conversationId`

请求头：

- `Content-Type: application/json`

请求体字段：

- `kind`: `string`，可选，默认 `markdown`
- `content`: `string`，必填
- `attachment_asset_ids`: `string[]`，可选
- `attachmentAssetIds`: `string[]`，可选
- `client_request_id`: `string`，可选
- `clientRequestId`: `string`，可选
- `context`: `Record<string, unknown>`，可选

请求示例：

```json
{
  "kind": "markdown",
  "content": "请基于这份简历给我一些优化建议",
  "attachment_asset_ids": ["asset-123"],
  "client_request_id": "req-client-001"
}
```

返回字段：

- `accepted`: `boolean`
- `message_id`: `string`
- `messageId`: `string`
- `assistant_message_id`: `string`
- `assistantMessageId`: `string`
- `status`: `string`

返回示例：

```json
{
  "accepted": true,
  "message_id": "message-user-101",
  "messageId": "message-user-101",
  "assistant_message_id": "message-assistant-102",
  "assistantMessageId": "message-assistant-102",
  "status": "done"
}
```

处理逻辑：

- 先读取该会话已有消息历史
- 根据 `attachment_asset_ids` 从 `_manifest.json` 里解析附件
- 生成一条 `user` 消息并写入 JSON 文件
- 调用当前 `AgentService`
- 生成一条 `assistant` 消息并写入 JSON 文件
- 更新会话 `preview` 和 `updatedAt`

注意：

- 如果消息附带文件，写入消息记录时会把文件路径写入 `media`/`attachments`
- 当前消息与 Agent 回复会一起写回会话消息 JSON

### 5. 上传文件

`POST /api/career-agent/threads/:id/files`

路径参数：

- `id`: `number`，会话 id，即 `conversationId`

请求格式：

- `multipart/form-data`

表单字段：

- `file`: 文件，必填

限制：

- 单文件最大 `20MB`

支持类型：

- `image/*`
- `video/*`
- `text/*`
- `application/pdf`
- 包含 `json` / `word` / `sheet` / `presentation` / `zip` 的 mime type
- `application/octet-stream`

返回：

- `UploadedConversationFile`

返回示例：

```json
{
  "asset_id": "asset-123",
  "assetId": "asset-123",
  "kind": "file",
  "url": "/api/career-agent/threads/12/files/1714123456789-uuid.pdf",
  "title": "resume.pdf",
  "mime_type": "application/pdf",
  "mimeType": "application/pdf",
  "size_bytes": 245991,
  "sizeBytes": 245991,
  "created_at": "2026-04-26T10:05:00.000Z",
  "createdAt": "2026-04-26T10:05:00.000Z",
  "storage_path": "/api/career-agent/threads/12/files/1714123456789-uuid.pdf",
  "storagePath": "/api/career-agent/threads/12/files/1714123456789-uuid.pdf",
  "stored_file_name": "1714123456789-uuid.pdf",
  "storedFileName": "1714123456789-uuid.pdf",
  "original_name": "resume.pdf",
  "originalName": "resume.pdf"
}
```

处理逻辑：

- 文件写入 `backend/src/Network/files/{conversation_id}/`
- 自动生成不重复文件名
- 把文件元信息写入 `_manifest.json`
- 返回 `asset_id`，供发消息时通过 `attachment_asset_ids` 引用

### 6. 读取已上传文件

`GET /api/career-agent/threads/:id/files/:fileName`

路径参数：

- `id`: `number`，会话 id，即 `conversationId`
- `fileName`: `string`，文件实际保存名

返回：

- 文件流

响应头：

- `Content-Type`
- `Content-Disposition`

说明：

- 该接口通过 `fileName` 查找 `_manifest.json`
- 校验存在后读取实际文件并返回

## 当前实现与 recommended-api-contract.md 的差异

### 1. `GET /threads/:id` 的语义不同

契约倾向于：

- `GET /threads/:userId` 返回会话列表

当前实现也是这个行为，但路径命名上仍然是 `:id`，不是 `:userId`。

### 2. 文件上传不是 presign 三段式

契约里提到了：

1. 申请上传
2. 上传二进制
3. 完成上传

当前实现采用的是单接口直传：

- `POST /threads/:id/files`

### 3. 错误返回还不是统一错误对象

契约建议错误格式：

```json
{
  "code": "THREAD_NOT_FOUND",
  "message": "thread not found",
  "request_id": "req_xxx"
}
```

当前仍然主要使用 Nest 默认异常返回。

### 4. 新建会话返回的是 ThreadSummary

当前实现已经能满足前端建会话后立即使用，但返回仍是项目当前定义，并未完全扩展出契约里所有可能字段。

## 当前建议联调顺序

1. `POST /api/career-agent/threads` 新建会话
2. `POST /api/career-agent/threads/:id/files` 上传文件
3. `POST /api/career-agent/threads/:id/messages` 发送消息并引用 `attachment_asset_ids`
4. `GET /api/career-agent/threads/:id/messages` 读取带附件路径的历史消息
