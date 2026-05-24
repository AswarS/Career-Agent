# 职业规划助手 API 合同

## 1. 概述

本文档定义职业规划助手前端 API 集成合同，作为前后端联调实现依据。

参考实现：

- 路由常量: [../src/services/careerAgentApiRoutes.ts](../src/services/careerAgentApiRoutes.ts#L1)
- 客户端接口: [../src/services/careerAgentClient.ts](../src/services/careerAgentClient.ts#L1)
- 上游字段归一化: [../src/services/upstreamContracts.ts](../src/services/upstreamContracts.ts#L1)

## 2. 通用约定

### 2.1 基础路径

- Base Path: /api/career-agent

### 2.2 请求与响应格式

- 请求 Content-Type: application/json; charset=utf-8
- 响应 Content-Type: application/json; charset=utf-8
- 字符编码：UTF-8

### 2.3 字段命名

- 上游主推 snake_case
- 兼容 camelCase（兼容字段见"兼容性规则"）

### 2.4 时间格式

- 统一使用 ISO 8601（UTC）
- 示例：2026-04-15T09:00:00Z

### 2.5 认证与请求上下文

- 前端已提供登录/注册页；mock 模式使用本地模拟 session
- upstream 联调模式已实现 `POST /api/career-agent/auth/login`、`POST /api/career-agent/auth/register`、`POST /api/career-agent/auth/refresh`、`GET /api/career-agent/auth/session`、`POST /api/career-agent/auth/logout`
- upstream 登录/注册成功后返回 `AuthSession`，前端保存 `access_token` 并在后续请求中携带 `Authorization: Bearer <token>`
- 除登录、注册、刷新 Token 外，`/api/career-agent` 下接口均需要 Bearer Token；未认证或认证失效时返回 401
- upstream 联调模式，当前会话列表先按路径参数携带用户 id：`GET /api/career-agent/threads/:userId`
- 前端默认用户 id 为 `1`，可通过 `VITE_CAREER_AGENT_USER_ID` 覆盖；登录后如 session 返回 `user.id`，前端优先使用该 id 读取会话列表和创建会话
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
| 400 | AUTH_VALIDATION_FAILED | 登录/注册参数校验失败 |
| 400 | API_KEY_REQUIRED | 新建配置或测试连接时缺少 API Key |
| 400 | API_BASE_URL_INVALID | base_url 不是合法 http/https URL |
| 400 | UNSUPPORTED_PROVIDER | 当前 provider 不支持 |
| 400 | PROFILE_VALIDATION_FAILED | 请求参数或字段校验失败 |
| 401 | UNAUTHORIZED | 未认证或认证失效 |
| 401 | INVALID_CREDENTIALS | 登录账号或密码错误 |
| 404 | USER_NOT_FOUND | 用户不存在 |
| 409 | USER_ALREADY_EXISTS | 邮箱或用户名已存在 |
| 409 | USERNAME_ALREADY_EXISTS | 修改后的用户名已存在 |
| 409 | USER_SETTING_ALREADY_EXISTS | 用户 API 配置已存在 |
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

### 4.8 AuthUser

```json
{
  "id": "1",
  "email": "user@example.com",
  "username": "user",
  "display_name": "用户",
  "displayName": "用户"
}
```

字段：

- id: string，后续会话列表与新建会话优先使用该用户 id
- email: string（可选）
- username: string（可选）
- display_name/displayName: string

### 4.9 AuthSession

```json
{
  "user": {
    "id": "1",
    "email": "user@example.com",
    "username": "user",
    "display_name": "用户",
    "displayName": "用户"
  },
  "access_token": "jwt_access_token",
  "accessToken": "jwt_access_token",
  "refresh_token": "opaque_refresh_token",
  "refreshToken": "opaque_refresh_token",
  "token_type": "Bearer",
  "tokenType": "Bearer",
  "expires_at": "2026-05-24T12:00:00.000Z",
  "expiresAt": "2026-05-24T12:00:00.000Z",
  "expires_in": 7200,
  "expiresIn": 7200
}
```

说明：

- `access_token` 为 Bearer Token，默认有效期 2 小时，可通过服务端环境变量 `CAREER_AGENT_ACCESS_TOKEN_SECONDS` 调整
- `refresh_token` 为不透明刷新令牌，默认有效期 7 天，可通过 `CAREER_AGENT_REFRESH_TOKEN_SECONDS` 调整
- 当前实现使用服务端 HMAC JWT 作为 access token，密码使用 `crypto.scrypt` 加盐哈希存储；生产环境应设置 `CAREER_AGENT_JWT_SECRET`

### 4.10 AccountSetting

```json
{
  "id": "1",
  "email": "user@example.com",
  "username": "user",
  "display_name": "用户",
  "displayName": "用户",
  "created_at": "2026-05-24T12:00:00.000Z",
  "createdAt": "2026-05-24T12:00:00.000Z",
  "updated_at": "2026-05-24T12:00:00.000Z",
  "updatedAt": "2026-05-24T12:00:00.000Z"
}
```

字段：

- id: string
- email: string（可选）
- username: string（可选）
- display_name/displayName: string
- created_at/createdAt: string
- updated_at/updatedAt: string

### 4.11 ApiSetting

```json
{
  "id": "1",
  "user_id": "1",
  "userId": "1",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "base_url": "https://api.anthropic.com",
  "baseUrl": "https://api.anthropic.com",
  "has_api_key": true,
  "hasApiKey": true,
  "api_key_hint": "sk-ant-...abcd",
  "apiKeyHint": "sk-ant-...abcd",
  "api_key_fingerprint": "a1b2c3d4e5f6a7b8",
  "apiKeyFingerprint": "a1b2c3d4e5f6a7b8",
  "created_at": "2026-05-24T12:00:00.000Z",
  "createdAt": "2026-05-24T12:00:00.000Z",
  "updated_at": "2026-05-24T12:00:00.000Z",
  "updatedAt": "2026-05-24T12:00:00.000Z"
}
```

说明：

- 当前 provider 支持并默认 `anthropic`
- API Key 使用 AES-256-GCM 加密保存
- 响应不会返回明文 API Key，只返回是否已配置、掩码和指纹
- 加密密钥来自 `CAREER_AGENT_SETTINGS_SECRET`，未配置时回退到 `CAREER_AGENT_JWT_SECRET`、`JWT_SECRET`、开发默认值

### 4.12 UserSettings

```json
{
  "account": {
    "id": "1",
    "email": "user@example.com",
    "username": "user",
    "display_name": "用户",
    "displayName": "用户"
  },
  "api_settings": [
    {
      "id": "1",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5",
      "base_url": "https://api.anthropic.com",
      "has_api_key": true,
      "api_key_hint": "sk-ant-...abcd"
    }
  ],
  "apiSettings": [
    {
      "id": "1",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5",
      "baseUrl": "https://api.anthropic.com",
      "hasApiKey": true,
      "apiKeyHint": "sk-ant-...abcd"
    }
  ]
}
```

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

### 5.9 用户认证

#### 5.9.1 注册

- 方法：POST
- 路径：/api/career-agent/auth/register
- 鉴权：不需要 Bearer Token
- 请求体：RegisterRequest
- 响应 200：AuthSession
- 响应 400：AUTH_VALIDATION_FAILED
- 响应 409：USER_ALREADY_EXISTS

请求示例：

```json
{
  "email": "user@example.com",
  "username": "user",
  "display_name": "用户",
  "password": "password123"
}
```

字段：

- email: string（可选；email 与 username 至少提供一个）
- username: string（可选；email 与 username 至少提供一个）
- display_name/displayName: string（可选；不传时默认使用 username 或邮箱前缀）
- password: string，最少 8 位

注册成功后，后端会自动创建用户基础配置：

```json
{
  "display_name": "用户",
  "locale": "zh-CN",
  "timezone": "Asia/Shanghai",
  "onboarding_completed": false
}
```

#### 5.9.2 登录

- 方法：POST
- 路径：/api/career-agent/auth/login
- 鉴权：不需要 Bearer Token
- 请求体：LoginRequest
- 响应 200：AuthSession
- 响应 400：AUTH_VALIDATION_FAILED
- 响应 401：INVALID_CREDENTIALS

请求示例（邮箱登录）：

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

请求示例（用户名登录）：

```json
{
  "username": "user",
  "password": "password123"
}
```

兼容字段：

- identifier: string，可传邮箱或用户名

#### 5.9.3 当前 session

- 方法：GET
- 路径：/api/career-agent/auth/session
- 鉴权：需要 `Authorization: Bearer <access_token>`
- 响应 200：`{ "user": AuthUser }`
- 响应 401：UNAUTHORIZED

#### 5.9.4 刷新 Token

- 方法：POST
- 路径：/api/career-agent/auth/refresh
- 鉴权：不需要 Bearer Token
- 请求体：RefreshTokenRequest
- 响应 200：AuthSession
- 响应 401：UNAUTHORIZED

请求示例：

```json
{
  "refresh_token": "opaque_refresh_token"
}
```

#### 5.9.5 退出登录

- 方法：POST
- 路径：/api/career-agent/auth/logout
- 鉴权：需要 `Authorization: Bearer <access_token>`
- 响应 200：`{}`
- 响应 401：UNAUTHORIZED

退出登录会清空当前用户的刷新令牌并递增 token 版本，既有 access token 会在后续请求中失效。

### 5.10 用户设置

#### 5.10.1 获取设置页数据

- 方法：GET
- 路径：/api/career-agent/settings
- 鉴权：需要 `Authorization: Bearer <access_token>`
- 响应 200：UserSettings
- 响应 401：UNAUTHORIZED
- 响应 404：USER_NOT_FOUND

响应示例：

```json
{
  "account": {
    "id": "1",
    "email": "user@example.com",
    "username": "user",
    "display_name": "用户",
    "displayName": "用户"
  },
  "api_settings": [
    {
      "id": "1",
      "user_id": "1",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5",
      "base_url": "https://api.anthropic.com",
      "has_api_key": true,
      "api_key_hint": "sk-ant-...abcd"
    }
  ],
  "apiSettings": [
    {
      "id": "1",
      "userId": "1",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5",
      "baseUrl": "https://api.anthropic.com",
      "hasApiKey": true,
      "apiKeyHint": "sk-ant-...abcd"
    }
  ]
}
```

#### 5.10.2 修改用户名

- 方法：PATCH
- 路径：/api/career-agent/settings/username
- 鉴权：需要 `Authorization: Bearer <access_token>`
- 请求体：UpdateUsernameRequest
- 响应 200：`{ "message": string, "account": AccountSetting }`
- 响应 409：USERNAME_ALREADY_EXISTS

请求示例：

```json
{
  "username": "new_user",
  "display_name": "新用户名"
}
```

字段：

- username: string，必填，2-40 位，仅允许字母、数字、下划线、连字符
- display_name/displayName: string（可选）

响应示例：

```json
{
  "message": "username updated successfully",
  "account": {
    "id": "1",
    "email": "user@example.com",
    "username": "new_user",
    "display_name": "新用户名",
    "displayName": "新用户名"
  }
}
```

#### 5.10.3 获取 API 配置列表

- 方法：GET
- 路径：/api/career-agent/settings/api
- 鉴权：需要 `Authorization: Bearer <access_token>`
- 响应 200：ApiSetting[]

说明：响应不包含明文 API Key。

#### 5.10.4 新增或更新 API 配置

- 方法：PUT
- 路径：/api/career-agent/settings/api
- 鉴权：需要 `Authorization: Bearer <access_token>`
- 请求体：UpsertApiSettingRequest
- 响应 200：`{ "message": string, "api_setting": ApiSetting, "apiSetting": ApiSetting }`
- 响应 400：API_KEY_REQUIRED / API_BASE_URL_INVALID

请求示例：

```json
{
  "provider": "anthropic",
  "api_key": "sk-ant-api03-xxx",
  "model": "claude-sonnet-4-5",
  "base_url": "https://api.anthropic.com"
}
```

字段：

- provider: string（可选），当前支持并默认 `anthropic`
- api_key/apiKey: string，新建时必填；更新模型或 base URL 时可不传，保留原 API Key
- model: string（可选），默认 `claude-sonnet-4-5`
- base_url/baseUrl: string（可选），默认 `https://api.anthropic.com`

兼容说明：后端也接受 `POST /api/career-agent/settings/api` 执行同样的 upsert 逻辑，推荐前端按本文档使用 PUT。

#### 5.10.5 测试 API 连接

- 方法：POST
- 路径：/api/career-agent/settings/api/test
- 鉴权：需要 `Authorization: Bearer <access_token>`
- 请求体：TestApiSettingRequest
- 响应 200：ConnectionTestResult
- 响应 400：API_KEY_REQUIRED / API_BASE_URL_INVALID / UNSUPPORTED_PROVIDER

请求可以直接测试新 key：

```json
{
  "provider": "anthropic",
  "api_key": "sk-ant-api03-xxx",
  "model": "claude-sonnet-4-5",
  "base_url": "https://api.anthropic.com"
}
```

也可以不传 `api_key`，使用已保存配置：

```json
{
  "provider": "anthropic"
}
```

测试方式：

- 统一使用 Anthropic Messages API 格式
- 请求 `POST {base_url}/v1/messages`
- 请求头包含 `x-api-key` 和 `anthropic-version: 2023-06-01`
- 请求体使用最小 `messages` 测试 payload

成功响应示例：

```json
{
  "ok": true,
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "base_url": "https://api.anthropic.com",
  "baseUrl": "https://api.anthropic.com",
  "status": 200,
  "message": "connection succeeded"
}
```

失败响应示例：

```json
{
  "ok": false,
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "base_url": "https://api.anthropic.com",
  "baseUrl": "https://api.anthropic.com",
  "status": 401,
  "message": "..."
}
```

## 6. 扩展接口（启用时实现）

### 6.1 会话写入

#### 6.1.1 发送消息

- 方法：POST
- 路径：/api/career-agent/threads/:threadId/messages
- 鉴权：需要 `Authorization: Bearer <access_token>`
- 响应 400：API_KEY_REQUIRED（当前用户未保存 Anthropic API Key）

说明：后端会根据会话所属 `userId` 读取该用户保存的 `anthropic` API 配置，并传给 Agent 运行时：

- apiKey: 解密后的用户 API Key
- baseUrl: 用户配置的 Anthropic 兼容地址
- model: 用户配置模型

Agent 运行时直接调用 Anthropic Messages API：

- 请求 `POST {baseUrl}/v1/messages`，如果 `baseUrl` 已以 `/v1` 结尾则请求 `{baseUrl}/messages`
- 请求头包含 `x-api-key` 和 `anthropic-version: 2023-06-01`
- 请求体使用 Anthropic `messages` 数组格式，并从本地 JSONL 会话记录拼接最近消息历史

如果用户没有配置 API Key，后端返回 400 `API_KEY_REQUIRED`。如果 Anthropic 返回鉴权或权限错误，发送消息响应会返回 `status: "failed"`，`reply/raw.error` 中包含上游错误信息。

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
- 认证字段兼容 display_name/displayName、access_token/accessToken、refresh_token/refreshToken、token_type/tokenType、expires_at/expiresAt、expires_in/expiresIn
- 用户设置字段兼容 api_settings/apiSettings、user_id/userId、base_url/baseUrl、has_api_key/hasApiKey、api_key_hint/apiKeyHint、api_key_fingerprint/apiKeyFingerprint

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

4. 用户 API Key 约束

- API Key 必须加密存储，不应以明文写入数据库
- API 响应不得返回明文 API Key
- 连接测试统一使用 Anthropic Messages API 格式
- 自定义 base_url 仅允许 http/https URL

## 9. 变更管理

- 任何接口路径、字段语义、状态语义变更，必须先更新本文档再实施
- 版本号采用语义化策略：
  - major：不兼容变更
  - minor：向后兼容新增
  - patch：文档澄清与非语义修订
