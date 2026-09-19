# Career Agent Training Gateway

独立训练 Gateway，当前已实现前五阶段代码：任务协议/API、后端 harness、用户与 workspace 初始化、执行管理、模型代理、主 Agent 交互采集、User 模拟终端和轨迹收发/封存/导出。
阶段六的一键运行、预检和验收工具已实现，真实环境端到端验收仍待配置后执行，见 [阶段六说明](docs/PHASE6.md)。

代理模式可采集主 Agent 请求、响应和工具结果；User 模拟器通过独立 API 自动回答 Ask_User_Question。阶段五支持推理生产方补交实际 token 数据并按请求导出。**普通模型 API 的文本/usage 不等于真实 token 数据；缺数据的轨迹不会标记为可训练。**

## 启动和测试

Node.js 24+，Gateway 无运行时第三方依赖。在仓库根目录执行：

```powershell
node Gateway/src/server.ts
node --test Gateway/tests/*.test.ts
```

未配置 harness 时保持仅登记模式，`execution.available=false`。配置后创建任务会自动进入准备和执行流程。
完整后端启动与配置见 [阶段二运行说明](docs/PHASE2.md)。
开启模型代理和轨迹采集见 [阶段三运行说明](docs/PHASE3.md)，需要配置 GATEWAY_PUBLIC_URL 和 GATEWAY_MODELS_JSON。
开启自动问答见 [阶段四运行说明](docs/PHASE4.md)，需要配置 GATEWAY_USER_MODELS_JSON；使用外部终端回答时将任务 userSimulator 设为 null。
事件协议、游标/SSE、封存和 token 导出见 [阶段五说明](docs/PHASE5.md)。存储目录必须由单个 Gateway 写入进程独占使用。

| 环境变量 | 默认值 | 含义 |
| --- | --- | --- |
| `GATEWAY_HOST` | `127.0.0.1` | 监听地址 |
| `GATEWAY_PORT` | `8787` | 端口 |
| `GATEWAY_API_TOKEN` | 未设置 | Gateway 服务凭据；非 loopback 监听时必填 |
| `GATEWAY_MAX_BODY_BYTES` | `1048576` | 请求 JSON 上限，包含初始文件 |
| `GATEWAY_MAX_RUNS` | `100` | 内存任务上限，含终态运行 |
| `GATEWAY_HARNESS_URL` | 未设置 | 例如 `http://127.0.0.1:4000/api/career-agent/training` |
| `GATEWAY_HARNESS_TOKEN` | 未设置 | 与后端 `CAREER_AGENT_TRAINING_TOKEN` 相同；与 URL 成对配置 |

设置 Gateway token 后，除 `/healthz` 外公开运行接口均要求 `Authorization: Bearer <token>`；内部模型代理使用独立 session token。
`harnessExecution=true` 仅说明适配器已配置；连接或后端配置问题会体现为运行失败。

## 调用示例

PowerShell，服务已在另一终端启动：

```powershell
$base = 'http://127.0.0.1:8787'
Invoke-RestMethod "$base/v1/capabilities"
$body = Get-Content -Raw -Encoding UTF8 Gateway/examples/task.json
$run = Invoke-RestMethod "$base/v1/runs" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
Invoke-RestMethod "$base/v1/runs/$($run.runId)"
Invoke-RestMethod "$base/v1/runs/$($run.runId)/cancel" -Method Post
# 已配置 harness 时：等待执行停止并删除该训练用户及其数据。
Invoke-RestMethod "$base/v1/runs/$($run.runId)" -Method Delete
```

使用 token 时添加 `-Headers @{ Authorization = "Bearer $env:GATEWAY_API_TOKEN" }`。
同一 `taskId` 重复 POST 创建新的采样实例，不是幂等重试。Gateway 到后端使用稳定 `runId`，后端拒绝同 ID 不同输入。

## 文档与代码

- [API](docs/API.md)：已实现与预留路由、错误和输入约束。
- [架构](docs/ARCHITECTURE.md)：身份、模块边界和训练语义。
- [阶段二运行说明](docs/PHASE2.md)：模型配置、状态、资源生命周期和限制。
- [阶段三运行说明](docs/PHASE3.md)：模型代理、主 Agent 过滤、Memory 禁用与 JSONL 记录。
- [阶段四运行说明](docs/PHASE4.md)：User 模型配置、提示词、外部终端 API、去重与限额。
- [阶段五说明](docs/PHASE5.md)：持久事件日志、封存清单、token 接入与完整性检查。
- [阶段六说明](docs/PHASE6.md)：配置模板、一键运行、端到端断言、验收报告和当前阻塞。
- [修改记录](docs/CHANGELOG.md)：变更文件、验证范围及后续工作。
- `src/harness/`：HTTP 客户端与运行编排。
- `src/sessions/`：内存任务状态；`src/api/`：对外接口及校验。
- 后端 `src/Network/modules/training-harness/`：服务鉴权/NestJS 适配和可独立测试的生命周期核心。

Gateway 和后端运行登记均为单进程内存状态；没有执行恢复、多副本协调或持久任务队列。阶段五已封存轨迹可在重启后读取。完成/失败后保留后端产物，显式 DELETE 才删除；准备失败自动回滚。DELETE 不删除轨迹归档。
开发依赖安装后可在 `Gateway/` 运行 `npm run typecheck`。Node 的类型擦除不等于静态类型检查。
