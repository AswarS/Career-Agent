# Agent Integration API

本文档用于说明 `Network` 模块接入真实 `agent` 模块时，模型组需要实现的接口、入参与出参定义、以及当前系统中的数据流。

适用代码位置：

- [agent.service.ts](C:\git\Career-Agent\backend\src\Network\modules\agent\agent.service.ts)
- [agent.runtime.ts](C:\git\Career-Agent\backend\src\Network\modules\agent\agent.runtime.ts)
- [conversation.service.ts](C:\git\Career-Agent\backend\src\Network\modules\conversation\conversation.service.ts)

## 目标

当前 `Network` 负责：

- 对前端提供 HTTP API
- 管理会话元数据的 SQLite 存储
- 管理上传文件落盘
- 维护 `message_id -> file/resource` 的 SQLite 映射
- 读取 agent 运行时产生的 `.jsonl` 消息文件并转换为前端消息格式

真实 `agent` 模块需要负责：

- 创建 agent 会话
- 处理用户发送的消息
- 在需要时返回回复中的文件资源信息

## 责任边界

### Network 负责

- `POST /api/career-agent/threads`
- `POST /api/career-agent/threads/:id/files`
- `POST /api/career-agent/threads/:id/messages`
- `GET /api/career-agent/threads/:id/messages`
- SQLite `conversations` 表维护
- SQLite `messages` 表维护
- `files/{conversation_id}` 上传文件存储
- `files/{conversation_id}/_manifest.json` 上传文件清单维护

### Agent 负责

- 创建 `{conversation_id}.jsonl`会话消息文件
- 收到用户消息后向 `.jsonl` 追加消息事件
- 生成 assistant 回复
- 如果 assistant 回复包含产出文件，返回文件元数据给 `Network`
- 历史消息的真实记录与运行轨迹写入

## 模型组需要实现的接口

当前 `Network` 通过 `AgentService` 调用两个核心函数。模型组至少需要实现这两个接口的真实逻辑。

### 1. createConversation

用途：

- 为指定用户创建一个 agent 会话
- 初始化该会话对应的运行时消息文件

TypeScript 接口：

```ts
export interface AgentCreateConversationInput {
  userId: string;
  title?: string;
  preview?: string;
}

export interface AgentConversationMetadata {
  conversationId: string;
  title: string;
  preview: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}
```

函数签名：

```ts
createConversation(
  input: AgentCreateConversationInput,
): Promise<AgentConversationMetadata>
```

必须实现的行为：

- 生成或申请一个唯一的 `conversationId`
- 在 `~/.claude/users/{sanitized_userId}/{session_id}.jsonl` 创建消息文件
- 返回该会话元数据

返回字段要求：

- `conversationId`: agent 内部真实会话 ID
- `title`: 初始标题，允许默认值
- `preview`: 初始摘要，允许为空字符串
- `status`: 初始建议返回 `active`
- `createdAt`: ISO 时间字符串
- `updatedAt`: ISO 时间字符串

### 2. sendMessage

用途：

- 向指定会话发送一条用户消息
- 驱动 agent 执行
- 将运行消息过程写入 `.jsonl`
- 返回本轮发送结果

TypeScript 接口：

```ts
export interface AgentAttachmentInput {
  assetId: string;
  path: string;
  title?: string;
  mimeType?: string;
}

export interface AgentSendMessageInput {
  conversationId: string;
  userId: string;
  content: string;
  kind?: string;
  attachments?: AgentAttachmentInput[];
  context?: Record<string, unknown>;
  clientRequestId?: string;
}

export interface AgentSendMessageResult {
  accepted: boolean;
  status: 'queued' | 'processing' | 'done' | 'failed';
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  reply: string;
  file?: AgentAttachmentInput | AgentAttachmentInput[];
  raw?: Record<string, unknown>;
}
```

函数签名：

```ts
sendMessage(
  input: AgentSendMessageInput,
): Promise<AgentSendMessageResult>
```

必须实现的行为：

- 接收 `Network` 转发过来的用户消息
- 使用 `conversationId` 找到对应 agent 会话
- 将用户消息写入 `user/{userId}/{conversationId}.jsonl`
- 执行模型推理或 agent 工作流
- 将 assistant 的思考过程、工具调用过程、最终回复写入 `.jsonl`
- 返回本轮消息的结果

返回字段要求：

- `accepted`: 是否成功受理该消息
- `status`: 当前处理状态
- `conversationId`: 原会话 ID
- `userMessageId`: 该轮用户消息唯一 ID
- `assistantMessageId`: 该轮 assistant 消息唯一 ID
- `reply`: assistant 最终文本回复
- `file`: 可选，若本轮回复中生成了文件或引用了文件，需要返回文件信息
- `raw`: 可选，保留原始执行结果、调试信息或中间结构

## file 字段约定

如果 `sendMessage(...)` 的回复包含文件，需要通过 `file` 字段返回给 `Network`。

推荐格式：

```json
{
  "assetId": "agent-file-001",
  "path": "/api/career-agent/threads/<conversation_id>/files/result.pdf",
  "title": "result.pdf",
  "mimeType": "application/pdf"
}
```

也允许数组：

```json
[
  {
    "assetId": "agent-file-001",
    "path": "/api/career-agent/threads/<conversation_id>/files/result.pdf",
    "title": "result.pdf",
    "mimeType": "application/pdf"
  }
]
```

`Network` 会做的事情：

- 将 `assistantMessageId -> file/resource` 关系写入 SQLite `messages` 表
- 在前端读取消息列表时，把这些文件补回 `media/attachments`

## Network 到 Agent 的数据流

### 1. 新建会话

时序：

1. 前端调用 `POST /api/career-agent/threads`
2. `Network` 接收请求并解析 `userId/title/preview`
3. `Network -> AgentService.createConversation(input)`
4. `agent` 创建真实会话并初始化 `.jsonl`
5. `agent` 返回 `conversationId + metadata`
6. `Network` 将会话元数据写入 SQLite `conversations`
7. `Network` 初始化 `files/{conversationId}/_manifest.json`
8. `Network` 返回会话摘要给前端

数据落盘：

- agent 历史消息文件：
  - `backend/src/Network/user/{userId}/{conversationId}.jsonl`
- SQLite 会话元数据：
  - `backend/src/Network/data/app.sqlite`
  - 表：`conversations`

### 2. 上传文件

时序：

1. 前端调用 `POST /api/career-agent/threads/:id/files`
2. `Network` 将文件保存到 `files/{conversationId}/`
3. `Network` 生成唯一文件名
4. `Network` 更新 `_manifest.json`
5. `Network` 返回 `asset_id` 给前端
6. 前端发送消息时，通过 `attachment_asset_ids` 引用该文件

数据落盘：

- 文件本体：
  - `backend/src/Network/files/{conversationId}/<stored_file_name>`
- 文件清单：
  - `backend/src/Network/files/{conversationId}/_manifest.json`

说明：

- 上传文件当前由 `Network` 管理，不需要 agent 自己再做一次上传
- agent 收到的是文件引用信息，不是二进制上传流

### 3. 发送消息

时序：

1. 前端调用 `POST /api/career-agent/threads/:id/messages`
2. `Network` 根据 `attachment_asset_ids` 从 `_manifest.json` 解析附件
3. `Network -> AgentService.sendMessage(input)`
4. `agent` 将用户消息写入 `.jsonl`
5. `agent` 执行推理、工具调用、生成回复
6. `agent` 将 assistant 过程与最终回复写入 `.jsonl`
7. `agent` 返回 `userMessageId / assistantMessageId / reply / file`
8. `Network` 将用户消息附件映射写入 SQLite `messages`
9. 如果 agent 返回 `file`，`Network` 将 assistant 文件映射写入 SQLite `messages`
10. `Network` 更新 SQLite `conversations.preview / updatedAt`
11. `Network` 将结果返回给前端

输入示例：

```json
{
  "conversationId": "41b8a0da-5249-4276-956b-2383620ac373",
  "userId": "1",
  "content": "请帮我分析这份简历",
  "kind": "markdown",
  "attachments": [
    {
      "assetId": "asset-123",
      "path": "/api/career-agent/threads/41b8a0da-5249-4276-956b-2383620ac373/files/1714123456789-uuid.pdf",
      "title": "resume.pdf",
      "mimeType": "application/pdf"
    }
  ],
  "clientRequestId": "req-client-001"
}
```

返回示例：

```json
{
  "accepted": true,
  "status": "done",
  "conversationId": "41b8a0da-5249-4276-956b-2383620ac373",
  "userMessageId": "msg_user_001",
  "assistantMessageId": "msg_assistant_001",
  "reply": "这是分析结果",
  "file": [
    {
      "assetId": "agent-file-001",
      "path": "/api/career-agent/threads/41b8a0da-5249-4276-956b-2383620ac373/files/report.pdf",
      "title": "report.pdf",
      "mimeType": "application/pdf"
    }
  ]
}
```

## Agent 运行时消息文件约定

当前 `Network` 已经实现了从 `.jsonl` 到前端消息结构的转换逻辑，所以真实 agent 输出需要尽量兼容以下结构。

### 用户消息事件

```json
{
  "parentUuid": null,
  "isSidechain": false,
  "promptId": "req-client-001",
  "type": "user",
  "message": {
    "id": "msg_user_001",
    "role": "user",
    "content": "请帮我分析这份简历"
  },
  "uuid": "runtime-event-001",
  "timestamp": "2026-04-26T10:00:00.000Z",
  "sessionId": "41b8a0da-5249-4276-956b-2383620ac373"
}
```

### assistant 思考事件

```json
{
  "type": "assistant",
  "message": {
    "id": "msg_assistant_001",
    "role": "assistant",
    "content": [
      {
        "type": "thinking",
        "thinking": "正在分析用户简历内容"
      }
    ]
  },
  "uuid": "runtime-event-002",
  "timestamp": "2026-04-26T10:00:00.300Z",
  "sessionId": "41b8a0da-5249-4276-956b-2383620ac373"
}
```

### assistant 文本回复事件

```json
{
  "type": "assistant",
  "message": {
    "id": "msg_assistant_001",
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "这是分析结果"
      }
    ]
  },
  "uuid": "runtime-event-003",
  "timestamp": "2026-04-26T10:00:00.700Z",
  "sessionId": "41b8a0da-5249-4276-956b-2383620ac373"
}
```

### tool result 事件

如果 agent 有工具调用结果，希望前端也能看到状态消息，建议兼容如下结构：

```json
{
  "type": "user",
  "message": {
    "id": "tool_result_001",
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "content": "文件解析完成"
      }
    ]
  },
  "uuid": "runtime-event-004",
  "timestamp": "2026-04-26T10:00:00.500Z",
  "sessionId": "41b8a0da-5249-4276-956b-2383620ac373"
}
```

## SQLite 需要配合的数据

### conversations 表

用途：

- 保存会话元数据

关键字段：

- `cid`: SQLite 自增主键
- `id`: agent conversation id
- `userId`
- `title`
- `preview`
- `status`
- `createdAt`
- `updatedAt`

### messages 表

用途：

- 保存消息与资源的映射

关键字段：

- `messageId`
- `conversationId`
- `resourceId`
- `resourceKind`
- `resourcePath`
- `mimeType`
- `title`
- `sizeBytes`
- `createdAt`

说明：

- `messages` 表不是消息全文存储
- 真正消息正文以 `.jsonl` 为准
- `messages` 表只用于把文件资源补回某条消息

## 推荐实现顺序

1. 实现 `createConversation`
2. 实现 `sendMessage`
3. 确保 `.jsonl` 输出结构与当前 `Network` 解析器兼容
4. 确保 `file` 字段返回格式稳定
5. 联调以下三条链路

联调顺序：

1. 新建会话
2. 上传文件
3. 发送带附件消息
4. 查询消息列表，检查 `media/attachments` 是否正确回填

## 当前最小可交付要求

如果模型组想先完成最小版本，至少需要满足：

1. `createConversation` 能返回真实 `conversationId` 并创建 `.jsonl`
2. `sendMessage` 能把用户消息和 assistant 文本回复写入 `.jsonl`
3. `sendMessage` 能返回 `userMessageId` 和 `assistantMessageId`
4. 如果有文件产出，`sendMessage` 返回 `file`
以上函数位于Network/modules/agent/agent.service.ts中
做到这一步后，`Network` 就能完成当前部署测试与基础前后端联调。
