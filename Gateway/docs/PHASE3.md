# 阶段三：模型代理与主 Agent 交互采集

## 启用

在阶段二的 Gateway 环境变量之外，增加：

```powershell
$env:GATEWAY_PUBLIC_URL = 'http://127.0.0.1:8787'
$env:GATEWAY_MODELS_JSON = '{"main-policy":{"provider":"openai","baseUrl":"http://127.0.0.1:8000/v1","apiKey":"<推理服务凭据>","model":"<模型名称>"}}'
node Gateway/src/server.ts
```

PUBLIC_URL 必须是后端能访问的 Gateway HTTP origin。跨机器部署要使用可达地址。
上游凭据此时只在 Gateway 配置中；后端仍需 `CAREER_AGENT_TRAINING_TOKEN`，但代理模式不再需要 `CAREER_AGENT_TRAINING_MODELS_JSON`。
Gateway 会给每个 run 分配 session URL 和独立 token，通过受保护的 harness 准备请求传给后端；不会在创建任务/查询任务响应中返回 token。

没有配置代理时保留阶段二直连模式，`modelProxy=false`、`mainAgentCapture=false`，不会产生模型轨迹。

| 配置 | 默认值 | 用途 |
| --- | --- | --- |
| `GATEWAY_PUBLIC_URL` | 未设置 | 后端回连地址 |
| `GATEWAY_MODELS_JSON` | `{}` | 以 modelProfile 为键的模型配置；支持 openai / anthropic |
| `GATEWAY_TRACE_DIR` | `Gateway/data/trajectories` | 主 Agent JSONL 记录目录 |
| `GATEWAY_MAX_MODEL_BODY_BYTES` | 16 MiB | 模型请求和工具结果上报的 JSON 上限 |
| `GATEWAY_MAX_RESPONSE_BYTES` | 32 MiB | 单次模型响应上限；超限中止且标记不完整 |

初始任务 JSON 仍使用原来的 GATEWAY_MAX_BODY_BYTES 上限。

## 数据路径和身份

```text
主 Agent / 子 Agent / 辅助调用
  → 后端 SDK（每次调用明确来源，不复用训练会话缓存客户端）
  → OpenAI 协议转换（如需要）
  → 附加训练身份的 wire fetch
  → Gateway session 代理
  → 原生协议上游
```

后端只在同时满足「根会话、无子 Agent ID、source 为 sdk 或 repl_main_thread 系列」时声明 main/policy。
显式 agentId 或异步子 Agent 上下文优先于 source；同样使用 sdk source 的子 Agent 也不会被当成主 Agent。
Profile 独立维护会话、压缩及未知来源归入 auxiliary；不保存其请求/响应内容。子 Agent 和辅助请求正常转发。

Gateway 验证 main 的 agentId 为 `main:<gatewaySessionId>`、purpose=policy 且没有父 Agent。缺少身份的调用拒绝，不能默认算主 Agent。
`requestId` 标识一次实际请求；`modelCallId` 按 fetch 客户端分组，`attempt` 为该客户端实际 fetch 次数。流式降级建立新客户端时会形成新分组，不声称跨降级已合并为同一次采样。
Gateway 不自动重试推理；每个主 Agent 上游尝试都消耗 maxModelCalls，包括上游错误后的重试。并发检查在转发前完成，超限返回 429。

请求的 messages、tools、采样参数和显式 model 透传；未指定 model 时使用配置默认值。上游认证由 Gateway 注入，训练身份和 session token 不透传给上游。

## 记录内容

每个 run 写入 `<runId>.jsonl`，格式为 `schemaVersion=diagnostic.v1`：

- `model.request`：实际转发的 body、原生协议、身份及尝试关联。
- `model.response`：原始 JSON/SSE 文本、流事件、组装后的助手回复/工具参数、usage、HTTP 状态、耗时和 complete。
- `tool.call`：主 Agent 可见的工具调用，包括 SkillTool 的调用边界。
- `tool.result`：工具原始返回。后端从根 SDK user 消息上报，因此不依赖下一次模型请求。
- `limit.exceeded` / `capture.rejected`：限制或污染检查结果，不含被拒绝提示词内容。

SkillTool 内部子 Agent 的对话不记录；SkillTool 返回给主 Agent 的结果保留。
仅接受已在主 Agent 模型响应中出现的 toolUseId；嵌套 SDK 消息不进行上报。相同工具结果重复递交共用写入确认，不重复记录；不同内容冲突返回 409。

OpenAI SSE 支持 UTF-8 分片、工具参数增量、reasoning_content 和 usage；Anthropic SSE 支持 text/thinking/signature、工具 JSON 增量和 usage 合并。原始响应保留全部字段；组装字段只作为便于检查的投影。
当前限制单次 n=1，多次采样使用独立 run。

采集顺序由 Gateway 为每个 run 分配 sequence。请求写入成功后才调用上游；流结束标记和非流式完整响应在落盘确认后才发给后端，防止采集失败却观察到成功结束。
JSONL append 失败后该 run 的写入队列保持失败，不跳过缺失事件继续标记正常。流中断/无结束标记/响应超限标记 complete=false。
这里的落盘确认是文件 append 成功，不包含 fsync、电源故障恢复或跨进程事务保证。

## Conversation Memory

训练会话关闭以下入口，普通用户仍沿用原行为：

1. 会话不配置 Conversation Memory 读写目录和 session 文件；其余 workspace、Profile、Auto Memory 配置保留。
2. 跳过回合召回和 checkpoint 状态建立。
3. 即使残留 enabled turn，也不注入停止提醒、压缩续写指令或提交 summary 更新。
4. 同会话的索引同步、召回、Conversation Memory 证据解析直接短路。
5. 跳过回合结束后读取 Conversation Memory 的 Profile 证据补充；不关闭 Profile 读写或 Profile 自身召回。

代理在转发/记录前拒绝框架专用的 `<conversation_memory>`、checkpoint 和 index-start 标记，不做导出后删词。
这项校验也会拒绝用户输入中原样出现这些保留标记的任务；不会过滤泛指 memory 的普通内容，Profile/Auto Memory 提示保留。

## 已实现接口

| 方法/路径 | 鉴权 | 用途 |
| --- | --- | --- |
| `POST /sessions/:id/v1/chat/completions` | session token | OpenAI 原生代理 |
| `POST /sessions/:id/v1/messages` | session token | Anthropic 原生代理 |
| `POST /sessions/:id/events` | session token | 主 Agent 工具结果上报 |
| `GET /v1/runs/:id/trace` | Gateway API token（如已配置） | 读取当前诊断记录 |

模型接口接受 Bearer 或 x-api-key 形式的 session token。工具结果接口用于后端内部接入，不是阶段五的通用训练事件接口。
trace 响应固定 `format=diagnostic`、`trainingReady=false`。未提供通用轨迹封存、训练 token IDs/logprobs/masks、游标导出或断点恢复，不能直接宣称为 on-policy RL 数据。

## 验证范围

`node --test Gateway/tests/*.test.ts` 覆盖真实本地 HTTP 上游替身、双协议流、主/子 Agent 身份、工具结果、并发限额、内存污染标记、采集故障和会话隔离。
Memory 测试加载真实后端 runtime/index/storage 函数，SQLite/YAML 使用一旦访问即报错的替身，验证禁用路径不触达存储并保留普通会话路径。
本机尚无完整后端依赖/Bun/TypeScript 编译器，真实 NestJS、SDK/数据库及实际推理服务仍待部署环境联调；测试通过不代表这些联调已完成。
