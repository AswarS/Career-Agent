# Network API 文档

## 1. 通用约定

- Base Path: `/api/career-agent`
- 请求与响应主格式：`application/json; charset=utf-8`
- 认证方式：`Authorization: Bearer <access_token>`
- 公开接口：`POST /auth/register`、`POST /auth/login`、`POST /auth/refresh`
- 其余 `/api/career-agent` 接口默认需要 Bearer Token
- 成功响应直接返回业务对象，不额外包裹 `data`
- 失败响应使用 HTTP 状态码，并尽量返回 `{ "code": "...", "message": "..." }`

## 2. 认证接口

### 2.1 注册

- 方法：`POST`
- 路径：`/api/career-agent/auth/register`
- 鉴权：不需要

请求：

```json
{
  "email": "user@example.com",
  "username": "user",
  "display_name": "用户",
  "password": "password123"
}
```

字段：

- `email`: 可选，邮箱和用户名至少提供一个
- `username`: 可选，邮箱和用户名至少提供一个
- `display_name` / `displayName`: 可选
- `password`: 必填，至少 8 位

响应：`AuthSession`

### 2.2 登录

- 方法：`POST`
- 路径：`/api/career-agent/auth/login`
- 鉴权：不需要

请求：

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

也支持：

```json
{
  "username": "user",
  "password": "password123"
}
```

兼容字段：

- `identifier`: 可传邮箱或用户名

响应：`AuthSession`

### 2.3 刷新 Token

- 方法：`POST`
- 路径：`/api/career-agent/auth/refresh`
- 鉴权：不需要

请求：

```json
{
  "refresh_token": "opaque_refresh_token"
}
```

兼容字段：`refreshToken`

响应：`AuthSession`

### 2.4 当前 Session

- 方法：`GET`
- 路径：`/api/career-agent/auth/session`
- 鉴权：需要 Bearer Token

响应：

```json
{
  "user": {
    "id": "1",
    "email": "user@example.com",
    "username": "user",
    "display_name": "用户",
    "displayName": "用户"
  }
}
```

### 2.5 退出登录

- 方法：`POST`
- 路径：`/api/career-agent/auth/logout`
- 鉴权：需要 Bearer Token

响应：

```json
{}
```

退出登录会清空刷新令牌并递增用户 `tokenVersion`，已有 access token 后续会失效。

## 3. 用户设置接口

### 3.1 获取设置页数据

- 方法：`GET`
- 路径：`/api/career-agent/settings`
- 鉴权：需要 Bearer Token

响应：

```json
{
  "account": {
    "id": "1",
    "email": "user@example.com",
    "username": "user",
    "display_name": "用户",
    "displayName": "用户",
    "created_at": "2026-05-24T12:00:00.000Z",
    "createdAt": "2026-05-24T12:00:00.000Z",
    "updated_at": "2026-05-24T12:00:00.000Z",
    "updatedAt": "2026-05-24T12:00:00.000Z"
  },
  "api_settings": [
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

说明：响应不会返回明文 API Key，只返回是否已配置、掩码和指纹。

### 3.2 修改用户名

- 方法：`PATCH`
- 路径：`/api/career-agent/settings/username`
- 鉴权：需要 Bearer Token

请求：

```json
{
  "username": "new_user",
  "display_name": "新用户名"
}
```

字段：

- `username`: 必填，2-40 位，只允许字母、数字、下划线、连字符
- `display_name` / `displayName`: 可选

响应：

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

错误：

- `409 USERNAME_ALREADY_EXISTS`: 用户名已存在

### 3.3 获取 API 配置列表

- 方法：`GET`
- 路径：`/api/career-agent/settings/api`
- 鉴权：需要 Bearer Token

响应：`ApiSetting[]`

### 3.4 新增或更新 API 配置

- 方法：`PUT`
- 路径：`/api/career-agent/settings/api`
- 鉴权：需要 Bearer Token

请求：

```json
{
  "provider": "anthropic",
  "api_key": "sk-ant-api03-xxx",
  "model": "claude-sonnet-4-5",
  "base_url": "https://api.anthropic.com"
}
```

字段：

- `provider`: 可选，当前支持并默认 `anthropic`
- `api_key` / `apiKey`: 新建时必填；更新模型或 base URL 时可不传，保留原 API Key
- `model`: 可选，默认 `claude-sonnet-4-5`
- `base_url` / `baseUrl`: 可选，默认 `https://api.anthropic.com`

响应：

```json
{
  "message": "api setting saved successfully",
  "api_setting": {
    "id": "1",
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "base_url": "https://api.anthropic.com",
    "has_api_key": true,
    "api_key_hint": "sk-ant-...abcd"
  },
  "apiSetting": {
    "id": "1",
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "baseUrl": "https://api.anthropic.com",
    "hasApiKey": true,
    "apiKeyHint": "sk-ant-...abcd"
  }
}
```

存储说明：

- API Key 使用 AES-256-GCM 加密保存
- 加密密钥来自 `CAREER_AGENT_SETTINGS_SECRET`，未配置时回退到 `CAREER_AGENT_JWT_SECRET`、`JWT_SECRET`、开发默认值
- 响应中不返回明文 API Key

### 3.5 测试 API 连接

- 方法：`POST`
- 路径：`/api/career-agent/settings/api/test`
- 鉴权：需要 Bearer Token

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

成功响应：

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

失败响应：

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

## 4. 会话接口中的用户 API 配置

发送消息接口：

- `POST /api/career-agent/threads/:threadId/messages`

后端会根据会话所属 `userId` 读取该用户的 `anthropic` API 配置，并传给 Agent 运行时：

- `apiKey`: 解密后的用户 API Key
- `baseUrl`: 用户配置的 Anthropic 兼容地址
- `model`: 用户配置模型

如果用户没有配置 API Key，仍保留原有 fallback 行为。

## 5. 错误码

| HTTP 状态码 | code | 含义 |
| --- | --- | --- |
| 400 | AUTH_VALIDATION_FAILED | 登录/注册参数错误 |
| 400 | API_KEY_REQUIRED | 新建配置或测试连接时缺少 API Key |
| 400 | API_BASE_URL_INVALID | base_url 不是合法 http/https URL |
| 400 | UNSUPPORTED_PROVIDER | 当前 provider 不支持 |
| 401 | UNAUTHORIZED | 未认证或 Token 失效 |
| 401 | INVALID_CREDENTIALS | 登录账号或密码错误 |
| 404 | USER_NOT_FOUND | 用户不存在 |
| 409 | USER_ALREADY_EXISTS | 注册邮箱或用户名已存在 |
| 409 | USERNAME_ALREADY_EXISTS | 修改后的用户名已存在 |
| 409 | USER_SETTING_ALREADY_EXISTS | 用户 API 配置已存在 |
