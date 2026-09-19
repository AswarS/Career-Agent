# 阶段六：一键运行与端到端验收

## 当前交付状态

已完成预检、一键工作流、验收断言、报告导出和自动测试。**本机真实环境验收未完成**：缺少 Bun、后端依赖、训练后端地址/凭据以及两个模型的配置。没有把本地 HTTP 测试替身当成真实 NestJS 或模型联调结果。
本次本机预检记录见 `phase6-local-validation.json`。静态类型检查也尚未完成，需要先安装开发依赖。

## 准备训练环境

Gateway 使用 Node 24+；后端使用其 package.json 指定的 Bun >=1.3.5 和现有 SQLite 迁移流程。后端启动是单独的部署步骤，工作流不会自动安装运行时、修改数据库 schema 或启动 Docker。

1. 将 `Gateway/.env.training.example` 复制为 `Gateway/.env.training` 并填写实际服务凭据和模型地址。本机配置文件已加入忽略规则。
2. 如果已有训练后端，填写可访问的 GATEWAY_HARNESS_URL；如果启动本地后端，在其目录安装依赖并执行既有迁移流程，再启动 network:start。训练建议使用显式配置的独立 CAREER_AGENT_DATABASE_PATH；数据库文件父目录要预先存在。
3. 后端的 CAREER_AGENT_TRAINING_TOKEN 必须与 GATEWAY_HARNESS_TOKEN 相同。Gateway PUBLIC_URL 必须能由后端访问；它不一定等于训练调用方访问 Gateway 的地址。
4. 配置主 Agent 和 User 模型服务，任务 modelProfile/userSimulator.modelProfile 必须与配置名称对应。

后端终端示例（从仓库根目录开始，已安装 Bun）：

```powershell
$trainingEnv = (Resolve-Path Gateway/.env.training).Path
Set-Location CrescoAI-Backend/backend
bun install --frozen-lockfile
bun --env-file=$trainingEnv run network:migrate
bun --env-file=$trainingEnv run network:start
```

这些部署命令尚未在本机执行，依赖安装及真实服务可用性需要部署环境验证。不要把默认数据库误当作隔离的训练数据库。

## 预检

仓库根目录执行：

```powershell
node --env-file=Gateway/.env.training Gateway/scripts/doctor.ts
```

输出 Node/Bun/本地依赖情况、配置是否存在、后端 databaseReachable 等固定字段，不打印配置值或密钥。退出码 0 表示具备执行服务验收的已检查条件；2 表示尚不具备。
使用远端后端时，本机没有 Bun 或后端依赖不会单独阻止验收。预检不调用模型，因此 modelApiProbed=false；模型配置看起来完整并不等于模型可用。

新增接口：

- `GET /v1/readiness`：Gateway API token 鉴权，汇总后端连通性/协议及代理配置。
- `GET /api/career-agent/training/runs/readiness`：后端独立训练 token 鉴权，执行只读 SELECT 1；返回实现标识、协议版本和 databaseReachable，不创建训练用户。SELECT 1 不证明所有业务迁移已完成。

## 一键执行与验收

后端和模型服务已运行时：

```powershell
node --env-file=Gateway/.env.training Gateway/scripts/run-training.ts --task Gateway/examples/task.json
```

该命令先预检后端，再在当前进程启动 Gateway，注册并运行两个独立采样，验证结果、封存、导出报告，最后关闭它启动的 Gateway。没有偷偷降级到 mock 或仅登记模式。
如果已有 Gateway，添加 `--gateway-url http://127.0.0.1:8787`，脚本只作为客户端，不停止已有服务。

每次验收会为各样本增加独立 proof 文件及指令，要求 Agent 读取文件并调用 Ask_User_Question。它是验收任务，不是对原训练 query 完全不改动的普通 rollout 工具。需要保持原任务原样时，直接调用已有 `/v1/runs` API。

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `--task` | examples/task.json | 任务 JSON，必须配置 User 模拟器 |
| `--samples` | 2 | 2–10 个样本，用于隔离检查 |
| `--output` | Gateway/data/acceptance/时间戳 | 报告目录；非空目录拒绝复用，以 .workflow-run 防止并发占用 |
| `--gateway-url` | 启动本地 Gateway | 使用已有 Gateway 的 HTTP origin |
| `--require-skill` | 关闭 | 要求模型调用可用 Skill 工具，未调用则验收失败 |
| `--require-training-ready` | 关闭 | 必须等待实际 token 并成功导出训练数据 |
| `--token-wait-ms` | 120000 | 严格模式等待 token 的额外时间，0–3600000 |
| `--cleanup` | 关闭 | 删除本次脚本已确认创建的训练用户/会话/workspace；保留轨迹归档 |

验证内容包括：真实绑定字段、不同 userId/conversationId/workspaceRoot/sessionId、初始文件字节数/SHA-256、工具返回中实际出现本样本 proof、主 Agent 请求响应对应及成功状态、Conversation Memory 保留标记不进入请求、User 模拟器回答与原 Ask 工具结果对应。
`--require-skill` 只能证明主轨迹中的 Skill 边界已执行及没有可见的非主模型身份；它不独立观测未被采集的子 Agent 内部。子 Agent 身份分类的否定场景由此前单元/HTTP 测试覆盖。

普通验收允许 trainingReady=false（例如模型仅提供文本/usage），报告会保留 reasons。严格模式命令示例：

```powershell
node --env-file=Gateway/.env.training Gateway/scripts/run-training.ts --require-skill --require-training-ready --token-wait-ms 120000 --cleanup
```

严格模式要求推理服务按 PHASE5 上报真实 token；缺 token 会失败并保留未封存日志，不自动伪造数组。Skill 能力取决于后端已安装工具及模型是否正确调用，脚本不会用假调用满足检查。

## 报告与失败处理

输出目录包含：

- `created-runs.json`：每次收到创建确认后更新，用于排查中断。
- `<runId>.trajectory.json`：已封存的完整导出。
- `report.json`：验收目标、就绪结果、每样本检查、训练就绪原因、隔离、取消及清理结果。退出码 0 为验收通过，1 为验收失败，2 为启动/配置/本地文件等错误。

脚本错误和上游响应使用固定故障类别，不将密钥或底层响应体写到报告。轨迹导出本身包含任务内容，应按训练数据管理。
默认保留后端资源。失败或 SIGINT/SIGTERM 中断时，尝试取消已确认创建的 run；`--cleanup` 才执行 DELETE。清理或取消确认失败记录在报告中，不能当成资源已经释放。
创建响应丢失会设置 creationUnconfirmed，脚本不会重复 POST 或猜测未知 runId。需要服务端排查可能已创建的任务；这不是全局 exactly-once 编排或可恢复任务队列。
进程被强制终止时 finally 无法保证执行，应根据 created-runs.json 和后端记录检查资源。

## 本次测试与剩余验收

`node --test Gateway/tests/*.test.ts` 共 60 项通过；阶段六新增 9 项，包括一键 HTTP 工作流、预检失败零分配、文件证据失败、严格 token 模式、身份/隔离断言、鉴权就绪接口、数据字段过滤和中断取消。
这些新增用例以本地 HTTP 服务模拟 Gateway/后端响应；前五阶段测试继续覆盖真实 Gateway 路由、后端纯核心、模型代理、问答和持久日志。它们不能替代完整 NestJS/SQLite/SDK/真实模型闭环。
下一步在已配置环境执行上述命令，保留 report.json；对真实 Skill 子 Agent 与实际推理 token 生产方执行严格模式，再完成静态类型检查。只有这些真实验收通过，才能将阶段六整体标记为完成。
