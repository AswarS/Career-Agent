# Gateway API v1

## 当前已实现

| 方法 | 路径 | 成功响应 | 语义 |
| --- | --- | --- | --- |
| GET | `/healthz` | 200 | 进程存活，无需鉴权；不表示后端或模型可用 |
| GET | `/v1/capabilities` | 200 | 返回阶段及能力开关 |
| GET | `/v1/readiness` | 200 | 后端只读就绪检查；ready=false 表示未就绪，不调用模型 |
| POST | `/v1/runs` | 201 | 校验并登记任务，Location 指向运行记录 |
| GET | `/v1/runs/:runId` | 200 | 读取任务记录，包含输入 |
| POST | `/v1/runs/:runId/cancel` | 200 | 取消已登记任务，重复取消幂等；请求体不需要 |
| DELETE | `/v1/runs/:runId` | 200 | 已配置 harness 时取消并清理后端训练用户及数据，保留 Gateway 记录 |
| POST | `/v1/runs/:id/user-questions/:toolUseId/respond` | 200 | 自动模拟或外部终端回答，返回运行记录 |

除健康接口外，若配置服务 token，必须带 Bearer 凭据。当前是一套受信训练服务接口，不是面向终端用户的多租户接口。

### 创建请求

完整样例见 `../examples/task.json`。

| 字段 | 必填 | 约束/默认 |
| --- | --- | --- |
| `taskId` | 是 | 非空字符串，至多 128 字符；允许重复，代表同一任务多次采样 |
| `profile` | 是 | JSON 对象；允许空对象，不预设业务 Profile 字段 |
| `query` | 是 | 非空字符串，至多 100000 字符 |
| `modelProfile` | 是 | 服务端模型配置名称，至多 128 字符；启用 harness 后由后端解析 |
| `workspace.files` | 否 | 默认空数组，最多 100 个文件；启用 harness 后写入独立 workspace |
| `userSimulator` | 否 | 默认 null；非空时必须包含 `modelProfile` |
| `limits.timeoutMs` | 否 | 默认 600000，范围 1000–86400000 |
| `limits.maxModelCalls` | 否 | 默认 100，范围 1–10000 |
| `limits.maxUserQuestions` | 否 | 默认 20，范围 0–1000 |

每个文件包含 `path`、`content` 及可选 `encoding`（默认 utf8，或规范 base64）。路径必须为正斜杠分隔的相对路径；拒绝绝对路径、穿越、Windows 保留名、大小写重复、文件/目录冲突。实际文件写入阶段仍须校验解析后路径及符号链接。

请求根对象、workspace、文件、limits、userSimulator 拒绝未知字段。Profile 是任务提供的开放 JSON 对象。API key 应通过未来服务端模型配置提供，不放入任务。

运行策略由 Gateway 固定为：

```json
{
  "conversationMemory": false,
  "captureAgentRole": "main",
  "otherBackendFeatures": "inherit"
}
```

阶段二配置 harness 后自动执行；未配置时 `execution.reason=harness_not_configured`，继续仅登记。
配置代理后，modelProxy/mainAgentCapture 返回 true；配置 harness 与 User 模型后 userSimulator=true。阶段五默认开启事件收发/封存/导出，trainingTokenIngest=true；内置推理引擎原生 token 提取 trainingTokens 仍为 false。参见 PHASE3.md、PHASE4.md 与 PHASE5.md。
运行记录的 `schemaVersion` 为 `1.0`；`runId` 同时是 rolloutId，不额外维护一个含义相同的 ID。

### 错误

```json
{
  "error": {
    "code": "invalid_request",
    "message": "profile must be an object",
    "requestId": "gateway-generated-uuid"
  }
}
```

每个响应包含 `x-request-id`，错误体使用相同 ID。

| 状态 | code 示例 | 场景 |
| --- | --- | --- |
| 400 | `invalid_json`, `invalid_request` | JSON/字段校验失败 |
| 401 | `unauthorized` | 凭据缺失或不正确 |
| 404 | `run_not_found`, `route_not_found` | 运行或路由不存在；未来路由尚未实现 |
| 409 | `invalid_run_state` | 状态不允许取消 |
| 413 | `body_too_large` | 请求体超限 |
| 415 | `unsupported_media_type`, `unsupported_encoding` | 非 JSON 或压缩请求 |
| 503 | `run_capacity_reached` | 内存登记上限，重启清空 |
| 500 | `internal_error` | 未知内部错误，不返回堆栈或配置 |
| 502 | `harness_cancel_unconfirmed`, `harness_cleanup_failed` | 后端取消/清理未确认 |

## 阶段三已实现的代理与诊断接口

| 方法/路径 | 用途 |
| --- | --- |
| `POST /sessions/:sessionId/v1/chat/completions` | OpenAI 原生代理，session 凭据 |
| `POST /sessions/:sessionId/v1/messages` | Anthropic 原生代理，session 凭据 |
| `POST /sessions/:sessionId/events` | 内部主 Agent 工具结果上报，session 凭据 |
| `GET /v1/runs/:id/trace` | 当前诊断记录，trainingReady=false |

代理 400 表示身份、协议或保留 Memory 标记校验失败；401 表示 session 凭据错误；409 表示会话非活动/结果冲突；429 表示主 Agent 调用次数超限。上游 HTTP 错误保留原状态。详情见 [PHASE3.md](PHASE3.md)。

## 阶段五已实现

### 不含 SSE 分片的消息导出

需要单一对话数组时使用 `GET /v1/runs/:id/trajectory?format=messages_list`，读取响应中的 `messages_list`。每项为 role/content 消息，保留 reasoning_content、tool_calls、tool_call_id 等协议字段。Anthropic 内容块保持原样，顶层 system 转为首条 system 消息。工具定义另存 `tools`。

Gateway 每次记录事件后自动、原子更新 `data/trajectories/<runId>.messages_list.json`，无需手动转换或封存；运行期间为最新快照，`throughSequence` 标识进度。读取 `issues` 判断缺失响应等问题。历史上下文被压缩或改写时，返回 `messages_list: null` 和具体 issue，应使用逐调用的 `format=messages`，不伪造连续对话。

请求历史中的重复前缀只保留一次，assistant 使用实际捕获的完整回复，避免后端在后续请求省略 reasoning 时丢失它。此数组不代表推理引擎的实际 token 序列或训练就绪状态。

`GET /v1/runs/:id/trajectory?format=messages` 返回 `gateway.messages.v1`：`calls` 中每项是一次主 Agent 模型调用，包含原始 `request`（含 messages/system/tools/模型参数）、合并后的 `assistant`（含 reasoning 和工具参数）、`usage`、`complete` 及关联的工具调用和结果。不返回 `rawBody` 或流式 delta events。请求仍原样保留 `stream` 参数以便溯源，但 assistant 已是合并后的消息。

按调用保存上下文快照，不将多次请求中重复的历史消息拼成一段虚构会话。`issues` 说明消息投影缺失或冲突；`trainingReady` 仍遵循真实 token、运行结束及封存检查，不等于消息可读性或业务任务成功。

不指定 format 或使用 `format=events` 仍返回原始事件，兼容既有消费方。原始 `.events.jsonl` 是审计日志，不是可直接投入训练的消息数据集。

已有日志可以离线转换，无需重跑任务（CMD）：

```cmd
node Gateway\scripts\export-messages.ts Gateway\data\trajectories\RUN_ID.events.jsonl
```

输出同目录 `RUN_ID.messages.json`，也可通过第二个参数指定新文件名。拒绝覆盖已有输出；不会修改、截断或封存源日志。不完整末行会报错，应等捕获写入完成后重试。离线结果为读取时的快照，不验证封存 manifest，故不会宣称 trainingReady=true。

| 阶段 | 接口 | 目的 |
| --- | --- | --- |
| 五 | `POST /v1/runs/:id/trajectory-events` | 专门接收轨迹事件 |
| 五 | `GET /v1/runs/:id/trajectory-events` | 游标/SSE 发送轨迹事件 |
| 五 | `GET /v1/runs/:id/trajectory` | 获取完整轨迹 |
| 五 | `POST /v1/runs/:id/finalize` | 等待写入并封存 |

事件封套定义在 `TrajectoryEventInput`：eventId 用于去重、runId 用于归属、Gateway 分配 sequence。GET events 支持 after/limit 和有限分页 SSE 回放。
运行执行结束与轨迹封存独立；finalize 发布校验清单，封存后禁止新事件。token 数组格式、训练就绪判断、恢复限制及错误语义见 [PHASE5.md](PHASE5.md)。

阶段二状态、额外返回字段、内部接口与启动条件见 [PHASE2.md](PHASE2.md)。代理模式强制 maxModelCalls，直连模式不计数；后端强制 maxUserQuestions，按不同 toolUseId 计数；timeoutMs 包含 User 推理等待。问答请求格式、错误和幂等语义见 [PHASE4.md](PHASE4.md)。
