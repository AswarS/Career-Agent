# 阶段二：后端 harness

本文保留阶段二直连模式说明。阶段三新增代理模式、主 Agent 采集和更完整的 Memory 禁用，参见 [PHASE3.md](PHASE3.md)；代理模式中 maxModelCalls 已强制执行。

后续 workspace 修正：训练初始化现已复用 `ensureNetworkUserWorkspaceDir`，先创建真实用户 workspace 并写入/回读验证文件，再初始化 Profile 和会话。新训练用户已有同 ID 用户目录或上传目录时拒绝执行；回滚保留这些未确认归属的文件。启动与 Agent 上下文均校验实际目录一致性，详见 CHANGELOG。

## 配置与启动

先按后端现有流程安装依赖、配置数据库和鉴权，再启动专用于训练的后端进程。当前模型请求直接使用已配置的外部/训练 API；Gateway 模型代理将在阶段三接入。

后端终端（PowerShell，仓库根目录）：

```powershell
$env:CAREER_AGENT_TRAINING_TOKEN = '<独立服务凭据>'
$env:CAREER_AGENT_TRAINING_MODELS_JSON = '{"main-policy":{"provider":"openai","baseUrl":"http://127.0.0.1:8000/v1","apiKey":"<模型服务凭据>","model":"<模型名称>"}}'
Set-Location CrescoAI-Backend/backend
bun run network:dev
```

模型配置支持 `openai` 或 `anthropic`。所有字段必填；无认证的本地兼容服务仍需非空占位 apiKey，以满足现有后端客户端要求。任务只传配置名称；凭据不返回 Gateway 运行记录。实际模型配置沿用后端 Settings 存储。

Gateway 终端（仓库根目录）：

```powershell
$env:GATEWAY_HARNESS_URL = 'http://127.0.0.1:4000/api/career-agent/training'
$env:GATEWAY_HARNESS_TOKEN = '<同一后端服务凭据>'
node Gateway/src/server.ts
```

后端未设置 `CAREER_AGENT_TRAINING_TOKEN` 时入口关闭，不受普通用户 JWT 或 `CAREER_AGENT_SKIP_AUTH` 绕过。
训练入口单独允许 2 MiB JSON parser 上限，核心任务验证仍限制为 1 MiB；普通 API 的 parser 配置不变。

## 运行流程

1. Gateway `POST /v1/runs` 登记输入并立即返回；后台向后端准备接口提交同一 runId/sessionId。
2. 后端先校验输入和模型配置，再创建无密码、无 refresh token 的训练用户。
3. 调用现有 Profile 服务建立画像，按用户保存模型配置，在其独立 workspace 写入初始文件。
4. 使用文件排他创建、父目录/符号链接检查；返回文件字节数和 SHA-256 清单。
5. 调用现有会话服务创建唯一会话，设置训练会话策略。全部完成后返回 ready。
6. Gateway 轮询发现 ready 后调用 start；后端消费现有会话服务的 Agent 事件流。
7. 收到明确成功的 message.completed 后才标记 completed；流中断、error、拒绝或无完成事件均失败。
8. Ask_User_Question 显示 waiting_user 与 pendingQuestion。本阶段不自动回答，超时/取消会终止等待。

Profile 使用后端支持的字段，例如 `fullName`、`educationBackground`、`workExperience`，或现有结构化分区。
空 Profile 保留默认值；完全不含支持字段的非空 Profile 会拒绝。字段归一化沿用现有 Profile 服务；Gateway 保留原始输入供后续 User 模拟器使用。

## 状态与清理

对外状态：`created → preparing → running ↔ waiting_user → completed/failed/cancelled/timed_out`。
后端内部另有 ready，Gateway 对外将其视为 preparing。

- `initialFiles`：初始化快照清单，即使后续文件变化也不更改。
- `harness`：初始化全部成功后的真实 userId、conversationId、workspaceRoot。
- `reply`：最后的业务回复，**不是训练轨迹**。
- `error`：不含凭据/底层堆栈的故障类别。
- `cleanup`：not_requested/pending/completed/failed，与执行状态独立。
- `pendingQuestion`：待回答工具块，供阶段四适配。

准备失败自动释放已创建资源，清理失败可通过 DELETE 重试。完成、运行失败、取消和超时默认保留用户数据供排查；DELETE 会先取消、等待执行退出、释放 runtime，再按训练用户归属检查删除数据。
重复 DELETE 幂等；原有普通账号删除逻辑默认行为不变。训练用户清理不发布真实账号禁用事件。
取消确认失败返回 502，不能认为后端已停止。通信丢失的运行标记执行状态未知并尝试取消；不会自动重放模型执行。

后端内部接口（均需服务 Bearer token）：

| 方法 | 路径（前缀 `/api/career-agent/training`） | 作用 |
| --- | --- | --- |
| POST | `/runs` | 校验并异步准备 |
| GET | `/runs/:id` | 状态/绑定/初始化清单 |
| POST | `/runs/:id/start` | 从 ready 开始执行；执行中或已完成时不重复启动 |
| POST | `/runs/:id/cancel` | 传播 AbortSignal |
| DELETE | `/runs/:id` | 等待停止并清理该训练用户的数据 |

## 会话隔离与当前边界

- 每次采样有独立用户、Profile、模型 Settings、会话及 workspace；后端执行不修改进程级模型环境变量，辅助模型从训练会话读取配置。
- 已添加会话级 Conversation Memory 禁用位，在 prepareConversationMemoryTurn 入口跳过召回/维护状态建立。其他用户保留原有行为；完整提示词与工具路径审计属于阶段三，当前不宣称已验证全部出站请求无 Memory 文本。
- timeoutMs 在后端覆盖准备、等待 start、执行和等待回答；取消是协作式，已在进行的 DB 操作要结束后才能回滚。
- maxModelCalls 与 maxUserQuestions 当前只登记，分别在阶段三/四接入计数和强制限制。自动用户 API 暂未启用。
- 单后端进程、单 Gateway 进程；两个服务重启均会失去内存关联。没有断点恢复；运行期间不要重启。底层 DB/文件可能留存，需按记录的训练用户 ID 排查，不会自动扫描删除用户。
- workspace 是逻辑文件隔离，并不是容器或操作系统沙箱。
- 此次验证使用真实 HTTP/临时文件与后端纯核心；NestJS 数据库、真实 Profile 服务及真实模型仍需部署环境联调。
