# 职业规划助手 API 合同

## 1. 概述

本文档定义职业规划助手前端 API 集成合同，作为前后端联调实现依据。

参考实现：

- 路由常量: [../../src/services/careerAgentApiRoutes.ts](../../src/services/careerAgentApiRoutes.ts#L1)
- 客户端接口: [../../src/services/careerAgentClient.ts](../../src/services/careerAgentClient.ts#L1)
- 上游字段归一化: [../../src/services/upstreamContracts.ts](../../src/services/upstreamContracts.ts#L1)

## 2. 通用约定

### 2.1 基础路径

- Base Path: /api/career-agent

### 2.2 请求与响应格式

- 请求 Content-Type: application/json; charset=utf-8
- 响应 Content-Type: application/json; charset=utf-8
- 字符编码：UTF-8

### 2.3 字段命名

- 上游主推 snake_case
- 兼容 camelCase（兼容字段见“兼容性规则”）

### 2.4 时间格式

- 统一使用 ISO 8601（UTC）
- 示例：2026-04-15T09:00:00Z

### 2.5 认证与请求上下文

- mock 模式可不启用登录
- upstream 联调模式，当前会话列表先按路径参数携带用户 id：`GET /api/career-agent/threads/:userId`
- 前端默认用户 id 为 `1`，可通过 `VITE_CAREER_AGENT_USER_ID` 覆盖
- 写请求（POST/PUT/DELETE）建议携带 x-request-id 用于链路追踪

### 2.6 成功与失败返回

- 成功：直接返回业务对象或数组，不包裹 data
- 失败：使用 HTTP 状态码，并返回统一错误对象

错误对象：

```json
{
  "code": "THREAD_NOT_FOUND",
  "message": "thread not found",
  "request_id": "req_xxx"
}
```

## 3. 错误码与状态码

| HTTP 状态码 | code | 含义 |
|---|---|---|
| 400 | PROFILE_VALIDATION_FAILED | 请求参数或字段校验失败 |
| 401 | UNAUTHORIZED | 未认证或认证失效 |
| 404 | THREAD_NOT_FOUND | 会话不存在 |
| 404 | ARTIFACT_NOT_FOUND | 工件不存在 |
| 413 | FILE_TOO_LARGE | 上传文件超过限制 |
| 415 | UNSUPPORTED_MEDIA_TYPE | 文件类型不支持 |
| 500 | INTERNAL_ERROR | 服务内部错误 |

## 4. 数据模型

### 4.1 ThreadSummary

```json
{
  "id": "thread-001",
  "title": "本周规划",
  "preview": "梳理本周重点",
  "status": "active",
  "updated_at": "2026-04-08T09:00:00Z"
}
```

字段：

- id: string
- title: string
- preview: string
- status: active | archived
- updated_at: string

### 4.2 ThreadMessage

```json
{
  "id": "message-001",
  "thread_id": "thread-001",
  "role": "assistant",
  "kind": "markdown",
  "content": "可以打开一个周计划画布",
  "reasoning": "先判断用户目标，再决定输出工件",
  "agent_id": "agent-planner",
  "agent_name": "规划助手",
  "agent_accent": "teal",
  "actions": [
    {
      "id": "action-open-weekly-plan",
      "kind": "open-artifact",
      "label": "打开周计划",
      "artifact_id": "artifact-weekly-plan",
      "view_mode": "pane"
    }
  ],
  "media": [
    {
      "id": "media-001",
      "kind": "image",
      "url": "/mock-media/test_image.png",
      "title": "示例图片"
    }
  ],
  "created_at": "2026-04-08T09:01:00Z"
}
```

字段：

- role: user | assistant | system
- kind: markdown | status
- reasoning: string | null（可选）
- actions: MessageAction[]（可选）
- media/attachments: MessageMedia[]（可选）

### 4.3 MessageAction

```json
{
  "id": "action-open-weekly-plan",
  "kind": "open-artifact",
  "label": "打开周计划",
  "artifact_id": "artifact-weekly-plan",
  "view_mode": "pane"
}
```

字段：

- kind: 仅支持 open-artifact（兼容 open_artifact）
- view_mode: pane | focus | immersive（可选）

### 4.4 MessageMedia

```json
{
  "id": "media-001",
  "kind": "image",
  "url": "https://cdn.example.com/a.png",
  "title": "示例图片",
  "caption": "说明",
  "alt": "替代文本",
  "mime_type": "image/png",
  "poster_url": null
}
```

字段：

- kind/type: image | video
- url/src: 浏览器可访问 URL
- mime_type/mimeType: 可选
- poster_url/posterUrl: 视频可选

### 4.5 ProfileRecord

字段（建议完整提供）：

- display_name
- locale
- timezone
- current_role
- employment_status
- experience_summary
- education_summary
- location_region
- target_role
- target_industries
- short_term_goal
- long_term_goal
- weekly_time_budget
- constraints
- work_preferences
- learning_preferences
- key_strengths
- risk_signals
- portfolio_links

### 4.6 ProfileSuggestion

```json
{
  "id": "suggestion-target-role",
  "title": "收紧目标角色",
  "rationale": "建议目标更聚焦",
  "source_thread_id": "thread-001",
  "patch": {
    "target_role": "AI 原生前端工程师"
  }
}
```

### 4.7 ArtifactRecord

```json
{
  "id": "artifact-weekly-plan",
  "type": "weekly-plan",
  "title": "周计划",
  "status": "ready",
  "render_mode": "html",
  "revision": 3,
  "updated_at": "2026-04-08T09:10:00Z",
  "summary": "本周执行安排",
  "payload": {
    "html": "<div>...</div>"
  }
}
```

字段：

- status: idle | loading | streaming | ready | stale | error
- render_mode: html | url | markdown | cards
- payload: 随 render_mode 变化

## 5. v1 核心接口

### 5.1 获取会话列表

- 方法：GET
- 路径：/api/career-agent/threads/:userId
- 路径参数：userId(string)，当前本地默认值为 1
- 响应 200：ThreadSummary[]

### 5.2 获取会话消息

- 方法：GET
- 路径：/api/career-agent/threads/:threadId/messages
- 路径参数：threadId(string)
- 响应 200：ThreadMessage[]
- 响应 404：THREAD_NOT_FOUND

### 5.3 获取画像

- 方法：GET
- 路径：/api/career-agent/profile
- 响应 200：ProfileRecord

### 5.4 更新画像

- 方法：PUT
- 路径：/api/career-agent/profile
- 请求体：ProfileRecord
- 响应 200：ProfileRecord
- 响应 400：PROFILE_VALIDATION_FAILED

### 5.5 获取画像建议

- 方法：GET
- 路径：/api/career-agent/profile/suggestions
- 响应 200：ProfileSuggestion[]

### 5.6 获取工件列表

- 方法：GET
- 路径：/api/career-agent/artifacts
- 响应 200：ArtifactRecord[]

### 5.7 获取单个工件

- 方法：GET
- 路径：/api/career-agent/artifacts/:artifactId
- 路径参数：artifactId(string)
- 响应 200：ArtifactRecord
- 响应 404：ARTIFACT_NOT_FOUND

### 5.8 刷新工件

- 方法：POST
- 路径：/api/career-agent/artifacts/:artifactId/refresh
- 路径参数：artifactId(string)
- 响应 200：ArtifactRecord（最新 revision）
- 响应 404：ARTIFACT_NOT_FOUND

## 6. 扩展接口（启用时实现）

### 6.1 会话写入

#### 6.1.1 发送消息

- 方法：POST
- 路径：/api/career-agent/threads/:threadId/messages

请求示例：

```json
{
  "kind": "markdown",
  "content": "请基于这张图给我一个面试建议",
  "attachment_asset_ids": ["asset-image-001"],
  "client_request_id": "req-client-001"
}
```

响应示例：

```json
{
  "accepted": true,
  "message_id": "message-user-101",
  "status": "queued"
}
```

状态建议：queued | processing | done | failed

#### 6.1.2 新建会话

- 方法：POST
- 路径：/api/career-agent/threads

#### 6.1.3 删除会话

- 方法：DELETE
- 路径：/api/career-agent/threads/:threadId

### 6.2 多模态上传（当前后端直传方案）

当前前端已经支持 composer 选择图片和文件。upstream 模式下，前端会先调用后端当前实现的会话文件直传接口，拿到 `asset_id` 后再发送消息。

#### 6.2.1 上传文件

- 方法：POST
- 路径：/api/career-agent/threads/:threadId/files
- 请求格式：multipart/form-data
- 表单字段：`file`
- 响应 200：UploadedConversationFile

响应示例：

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

#### 6.2.2 读取已上传文件

- 方法：GET
- 路径：/api/career-agent/threads/:threadId/files/:fileName
- 响应 200：文件流

说明：发送消息时通过 `attachment_asset_ids` 引用上传返回的 `asset_id`。后端返回的 `kind: "file"` 附件会在前端归一化为消息文件附件；`image` / `video` 继续按消息媒体展示。

### 6.2A 未来上传方案（三段式，暂未启用）

生产对象存储接入后，仍可演进为三段式上传流程。

#### 6.2A.1 申请上传

- 方法：POST
- 路径：/api/career-agent/uploads/image/presign

请求示例：

```json
{
  "file_name": "resume-note.png",
  "mime_type": "image/png",
  "file_size_bytes": 245991,
  "thread_id": "thread-001"
}
```

响应示例：

```json
{
  "upload_id": "upload-001",
  "upload_url": "https://storage.example.com/...",
  "upload_headers": {
    "content-type": "image/png"
  },
  "expires_at": "2026-04-16T08:00:00Z",
  "max_bytes": 5242880
}
```

#### 6.2A.2 上传二进制

- 方法：PUT
- 路径：upload_url（由 presign 返回）

#### 6.2A.3 完成上传

- 方法：POST
- 路径：/api/career-agent/uploads/complete

请求示例：

```json
{
  "upload_id": "upload-001",
  "thread_id": "thread-001"
}
```

响应示例：

```json
{
  "asset_id": "asset-image-001",
  "kind": "image",
  "url": "https://cdn.example.com/media/asset-image-001.png",
  "mime_type": "image/png",
  "size_bytes": 245991,
  "created_at": "2026-04-15T12:00:00Z"
}
```

说明：发送消息时通过 attachment_asset_ids 引用 asset_id。

### 6.3 工作画布交互回传

- 方法：POST
- 路径：/api/career-agent/artifacts/:artifactId/interactions

请求示例：

```json
{
  "thread_id": "thread-003",
  "artifact_revision": 6,
  "interaction_type": "submit-answer",
  "action_id": "action-001",
  "payload": {
    "answer": "..."
  },
  "created_at": "2026-04-15T09:00:00Z"
}
```

响应示例：

```json
{
  "accepted": true,
  "event_id": "event-001"
}
```

## 7. 兼容性规则

1. 命名兼容

- 线程与消息字段兼容 thread_id/threadId、created_at/createdAt
- 动作字段兼容 artifact_id/artifactId、view_mode/viewMode
- 工件字段兼容 render_mode/renderMode、updated_at/updatedAt
- 画像建议字段兼容 source_thread_id/sourceThreadId

2. 动作兼容

- kind 兼容 open-artifact 与 open_artifact
- 非 open-artifact 动作可忽略

3. 媒体兼容

- 仅消费 image/video
- media 与 attachments 合并处理
- URL 必须为可访问相对路径或 http/https

4. 状态兼容

- artifact.status 可兼容 queued、failed
- 前端归一化后分别按 loading、error 处理

## 8. 安全与约束

1. URL 与路径约束

- 不应返回 /Users/... 等本机绝对路径
- 不应返回 file:// URL
- 不应返回 javascript:、data: 等不安全 scheme

2. URL 型工件约束

- 仅允许相对路径或受信任来源的 http/https URL
- iframe 宿主按受信任策略加载

3. 上传约束

- 服务端应校验大小、数量、MIME 白名单
- 建议在上传完成后进行安全扫描或处理

## 9. 变更管理

- 任何接口路径、字段语义、状态语义变更，必须先更新本文档再实施
- 版本号采用语义化策略：
  - major：不兼容变更
  - minor：向后兼容新增
  - patch：文档澄清与非语义修订
