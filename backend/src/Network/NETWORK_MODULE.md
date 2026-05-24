# Network 模块说明

## 1. 模块职责

`backend/src/Network` 是职业规划助手的 NestJS HTTP API 层，负责：

- 用户注册、登录、Token 鉴权
- 用户设置页后端能力，包括账号信息、用户名修改、API 配置
- 会话创建、消息发送、消息历史读取
- 会话文件上传和读取
- 工件、团队、技能等已有接口聚合
- SQLite 数据表和本地 JSONL/文件存储管理

## 2. 入口与全局配置

入口文件：[main.ts](./main.ts)

核心行为：

- 创建 Nest 应用
- 开启 CORS
- 启用全局 `ValidationPipe`
- 默认监听 `4000` 端口，可通过 `PORT` 环境变量覆盖

主模块：[app.module.ts](./app.module.ts)

核心行为：

- 连接 SQLite：`data/test.sqlite`
- 开启 TypeORM `synchronize`
- 注册实体：`users`、`user_settings`、`conversations`、`messages`、`artifacts`、`teams`
- 注册业务模块：认证、用户设置、会话、Agent、工件、团队、技能

## 3. 数据存储

### 3.1 SQLite

数据库文件：

```txt
backend/src/Network/data/test.sqlite
```

核心表：

- `users`: 用户账号、密码哈希、刷新令牌、基础画像配置
- `user_settings`: 用户 API 配置
- `conversations`: 会话元数据
- `messages`: 会话资源映射
- `artifacts`: 工件元数据
- `teams`: 团队元数据

### 3.2 JSONL 会话历史

会话运行时消息写入：

```txt
backend/src/Network/user/{userId}/{conversationId}.jsonl
```

读取会话消息时，后端会解析 JSONL 并归一化为前端需要的 `ThreadMessage[]`。

### 3.3 会话文件

上传文件写入：

```txt
backend/src/Network/files/{userId}/{conversationId}/{storedFileName}
```

每个会话目录包含 `_manifest.json`，记录 `asset_id`、文件名、MIME、大小、URL 等元数据。

## 4. 认证模块

位置：

```txt
backend/src/Network/modules/auth
```

主要文件：

- `auth.controller.ts`: 注册、登录、刷新、session、logout 接口
- `auth.service.ts`: 密码哈希、Token 签发、刷新令牌、会话校验
- `auth.guard.ts`: 全局 Bearer Token 校验
- `public.decorator.ts`: 标记公开接口

实现细节：

- 密码使用 Node `crypto.scrypt` 加盐哈希，不保存明文
- Access Token 使用 HMAC JWT 格式
- Refresh Token 是不透明随机令牌，数据库只保存 SHA-256 指纹
- Logout 会清空刷新令牌并递增 `tokenVersion`
- Guard 只拦截 `/api/career-agent` 下非公开接口

重要环境变量：

- `CAREER_AGENT_JWT_SECRET`: access token 签名密钥
- `CAREER_AGENT_ACCESS_TOKEN_SECONDS`: access token 有效期，默认 7200 秒
- `CAREER_AGENT_REFRESH_TOKEN_SECONDS`: refresh token 有效期，默认 7 天

## 5. 用户设置模块

位置：

```txt
backend/src/Network/modules/user-settings
```

主要文件：

- `user-settings.controller.ts`: 设置页接口
- `user-settings.service.ts`: 用户名修改、API Key 加密、连接测试、Agent 配置读取
- `entities/user-setting.entity.ts`: `user_settings` 表实体
- `dto/update-username.dto.ts`: 用户名修改参数校验
- `dto/upsert-api-setting.dto.ts`: API 配置新增/更新参数校验
- `dto/test-api-setting.dto.ts`: 连接测试参数

### 5.1 用户名设置

接口：

```txt
PATCH /api/career-agent/settings/username
```

规则：

- 用户名统一 trim 并转小写保存
- 长度 2-40
- 仅允许字母、数字、下划线、连字符
- 保存前查询唯一性
- 数据库唯一索引作为并发兜底

### 5.2 API 配置

接口：

```txt
GET /api/career-agent/settings/api
PUT /api/career-agent/settings/api
POST /api/career-agent/settings/api/test
```

当前 provider：

- `anthropic`

存储字段：

- `provider`
- `apiKeyEncrypted`
- `apiKeyFingerprint`
- `apiKeyHint`
- `model`
- `baseUrl`

安全策略：

- API Key 使用 AES-256-GCM 加密保存
- 加密密钥来自 `CAREER_AGENT_SETTINGS_SECRET`
- 未配置专用密钥时回退到 JWT secret，再回退开发默认值
- 响应只返回掩码和指纹，不返回明文

连接测试：

- 使用 Anthropic Messages API 格式
- 请求 `{baseUrl}/v1/messages`
- 发送最小 ping 消息
- 成功或失败都以业务对象返回，便于前端展示

重要环境变量：

- `CAREER_AGENT_SETTINGS_SECRET`: 用户 API Key 加密密钥

## 6. 会话模块如何使用用户 API 配置

位置：

```txt
backend/src/Network/modules/conversation
```

发送消息流程：

1. `ConversationController` 接收 `POST /api/career-agent/threads/:id/messages`
2. `ConversationService` 查找会话元数据
3. 解析上传附件
4. 调用 `UserSettingsService.getAgentConfig(conversation.userId)`
5. 将解密后的 `apiKey`、`baseUrl`、`model` 传给 `AgentService.sendMessage`
6. `AgentService` 从 JSONL 会话记录拼接最近消息历史，并直接调用 Anthropic Messages API 执行推理

如果用户没有配置 API Key：

- `ConversationService` 返回 400 `API_KEY_REQUIRED`

如果 Anthropic 返回鉴权或权限错误：

- `AgentService` 写入一条失败的 assistant 事件，便于前端展示
- 消息发送响应返回 `status: "failed"`，`reply/raw.error` 包含上游错误信息

## 7. 数据表说明

### 7.1 users

关键字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 自增主键 |
| `userId` | 字符串兼容用户 id |
| `email` | 邮箱，唯一 |
| `username` | 用户名，唯一 |
| `displayName` | 展示名 |
| `passwordHash` | scrypt 密码哈希，默认查询不返回 |
| `profileJson` | 注册时创建的基础配置 |
| `refreshTokenHash` | refresh token 指纹，默认查询不返回 |
| `refreshTokenExpiresAt` | refresh token 过期时间 |
| `tokenVersion` | token 版本，用于 logout 后失效旧 token |

### 7.2 user_settings

关键字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 自增主键 |
| `userId` | 用户 id |
| `provider` | API 服务提供方，当前为 `anthropic` |
| `apiKeyEncrypted` | AES-256-GCM 加密后的 API Key |
| `apiKeyFingerprint` | API Key 指纹，用于判断是否变更 |
| `apiKeyHint` | API Key 掩码展示 |
| `model` | 模型名 |
| `baseUrl` | Anthropic 兼容 API 地址 |
| `createdAt` | 创建时间 |
| `updatedAt` | 更新时间 |

唯一约束：

```txt
(userId, provider)
```

即每个用户每个 provider 只保存一条配置。

## 8. API 文档

Network 内完整接口文档位于：

```txt
backend/src/Network/API.md
```

新增用户设置接口包括：

- `GET /api/career-agent/settings`
- `PATCH /api/career-agent/settings/username`
- `GET /api/career-agent/settings/api`
- `PUT /api/career-agent/settings/api`
- `POST /api/career-agent/settings/api/test`

## 9. 本地运行

项目 package 脚本中 Network 启动命令：

```txt
bun run network:dev
```

等价入口：

```txt
bun run ./src/Network/main.ts
```

当前工作环境如果没有安装 `bun` 或依赖，无法直接启动或运行 TypeScript 编译检查。
