# Career-Agent 轨迹合成与质检 README

本文档是 `trajectory_gen/` 的主操作手册，说明从合成任务包到 Plan Model 训练样本的完整过程、每一道自动检查、判定字段、输出文件、失败保留方式和人工复核入口。

实现代码横跨三个区域：

- `trajectory_gen/`：任务物化、批量调度、单条轨迹运行、语义质检、产物归档和 viewer。
- `Gateway/`：Run 生命周期、教师模型代理、事件日志、模拟用户、消息投影和训练格式导出。
- `CrescoAI-Backend/backend/`：隔离用户、Profile、workspace、conversation 和真实 Career Agent 执行。

逐函数代码位置见 [`CODEMAP.md`](CODEMAP.md)。本文重点回答“怎么运行、检查了什么、什么情况下算通过”。

Windows → WSL 的完整手动合成命令见 [`MANUAL_SYNTHESIS.md`](MANUAL_SYNTHESIS.md)，包括 GLM-5.2、并发 3、失败补跑和结果统计。

## 1. 当前范围与结论口径

这里有三类容易混淆的“通过”：

1. **任务包静态校验通过**：文件、schema、材料闭包和发行规则通过，不代表真实 Agent 能完成任务。
2. **轨迹结构可训练**：事件完整、消息可还原、Qwen 格式合法，不代表工具规划符合任务预期。
3. **最终 Plan-SFT 通过**：Qwen 结构通过，并且必需工具均出现且相对顺序正确。

因此，`metadata/validation_report.json` 中的 `passed`、`summary.json` 中的 `structuralSftReady` 和最终 `sftReady` 不是同一个概念。

当前最终判定公式是：

```text
summary.sftReady
  = qwen.sftReady
  AND semanticAudit.accepted
```

普通文本 SFT 合成不要求生成模型提供原始 token IDs 或 logprobs。当前合成摘要和查看器已移除 `trainingReady`/`trainingReasons`；底层引擎 token 导出接口仍保留，供明确需要该数据的训练流程使用。

## 2. 总体流程

```text
上游合成任务包
  │
  ├─ 发行级静态筛选：1,915 → 排除 47 → 发布 1,868
  ├─ 根/包级 checksum、身份、材料和静态 validation 检查
  ▼
trajectory_gen/syn_tasks/<dataset>/packages/<scenario_id>/
  │
  ├─ prepare-syn-task-runs.ts
  │    ├─ 校验 task / persona / environment / materials
  │    ├─ 生成模型可见 request.json
  │    └─ 单独生成模型不可见 expectations.json
  ▼
trajectory_gen/trajectories/syn-tasks/requests/
  │
  ├─ 批量 runner 启动或复用训练后端
  ├─ 为每条任务创建隔离 user / profile / workspace / conversation
  ├─ Gateway 将私有教师指引只注入上游模型请求
  ├─ Career Agent 调用真实工具并由模拟用户回答必要问题
  └─ Gateway 捕获主 Agent 的 request / response / tool call / tool result
  ▼
不可变事件日志 finalize
  │
  ├─ 事件完整性与 token 质检
  ├─ messages / messages_list 投影
  ├─ Qwen3.5 SFT 结构质检
  ├─ binding 工具序列语义质检
  └─ workspace 产物与最终回复导出
  ▼
trajectory_gen/trajectories/syn-tasks/runs/<scenario_id>/
  │
  ├─ 通过：保留全部检查文件，并生成正式 *.qwen3_5_sft.jsonl
  └─ 未通过：保留轨迹、检查结果和产物，另存 *.qwen3_5_sft.rejected.jsonl
```

## 3. 目录结构

```text
trajectory_gen/
  README.md                         # 本文档
  CODEMAP.md                        # 功能到代码的详细映射
  scripts/                          # 物化、运行、质检、重导出和迁移脚本
  viewer/                           # 轨迹和任务检查界面
  examples/                         # 最小手工任务示例
  syn_tasks/                        # 所有输入任务集
    <dataset>/
      packages/<scenario_id>/
  trajectories/                    # 运行请求、事件和导出结果，默认被 git 忽略
    syn-tasks/
      requests/
      manifest.json
      runs/<scenario_id>/
  reports/                          # 分析报告、人工复核表和 QA 截图
  archive/                          # 历史归档包
```

默认任务集：

```text
trajectory_gen/syn_tasks/eduagentworld_taskset_v1_1868_20261002
```

可以用仓库相对路径切换任务集：

```powershell
$env:SYN_TASK_SOURCE = 'trajectory_gen\syn_tasks\<dataset>'
```

```bash
export SYN_TASK_SOURCE='trajectory_gen/syn_tasks/<dataset>'
```

在 Windows Terminal 中可见地运行指定范围，并临时覆盖主模型与模拟用户模型：

```powershell
powershell -ExecutionPolicy Bypass -File trajectory_gen\scripts\start-syn-task-trajectories-wsl-visible.ps1 `
  -Range 6-10 -Model Intern-S2-Preview
```

模型覆盖只对该批 WSL 进程生效，不改写 `Gateway/.env.training` 中的端点或密钥。

## 4. 输入任务包包含什么

每个 `packages/<scenario_id>/` 通常包含：

| 文件 | 用途 | 是否给模型直接看 |
|---|---|---|
| `task.json` | 用户指令、可用输入、约束、交付物、验收标准 | 指令字段会进入 query |
| `persona.json` | Career Agent 用户画像 | 作为 Profile 装载 |
| `environment.json` | 文件引用、资源闭包、生成信息 | 否，供物化器解析 |
| `materials_manifest.json` | 材料路径、大小、SHA-256、语义类型 | 只装载声明材料 |
| `material_requirements.json` | 材料需求契约 | 否，主要用于静态检查和 viewer |
| `materials/*` | 简历、岗位要求、追踪表等实际输入 | 挂载到 workspace |
| `invocation_bindings.json` | 预期工具序列及输入来源诊断 | **绝不合并进公开 request** |
| `metadata/validation_report.json` | 包级静态校验结果 | 否 |
| `metadata/task_tool_alignment_audit.json` | 任务族和 terminal tool 静态对齐 | 否 |
| `metadata/material_binding_audit.json` | 材料消费者和字段绑定审计 | 否 |
| `checksums.json` | 包内文件完整性 | 否 |

`invocation_bindings.json.validation_witness_arguments` 是合成时的校验见证值，不是真实工具 observation，不能作为训练输入或执行结果。

## 5. 阶段 A：上游任务发行与静态门禁

当前 1,868 条任务来自 1,915 个完整任务包。发行过程没有再次调用 LLM，也没有运行真实工具；它只进行了发行级筛选和完整性封装。

### 5.0 任务题材与基础质量初筛

发行完整性通过不代表题材一定适合通用 Career Agent。运行以下脚本可对当前任务集做一轮保守的确定性初筛：

```powershell
py -3 trajectory_gen\scripts\screen-syn-tasks.py
```

规则位于 `trajectory_gen/config/task-screening-rules.json`，当前覆盖：

- 占卜、灵媒、灵能等依赖不可验证主张的职业：当前目标命中时标为 `exclude_candidate`；仅在背景经历中出现时降为 `manual_review`。
- 博彩、外汇投机、选举活动、成人行业等需结合合法性和真实性判断的职业：标为 `manual_review`。
- 提示词注入、模板占位符、缺失必要字段、正文过短或过长、正文完全重复等基础质量问题。

脚本只生成报告，不修改或删除任务。输出位于 `trajectory_gen/reports/task_screening/`，包括完整 JSONL、建议隔离清单、人工复核清单和 Markdown 汇总。`pass_initial_screen` 仅表示没有命中这些简单规则，不等于完成全面质检。

### 5.1 已排除的 47 条

| 排除原因 | 数量 |
|---|---:|
| 真实 Web 工作流使用明显合成目标 | 10 |
| application tracking 工具能力越界 | 13 |
| baseline assessment 工具能力越界 | 10 |
| competency model 工具能力越界 | 3 |
| requirements extraction 工具能力越界 | 9 |
| 同时要求简历和外联、但工具不支持复合交付 | 1 |
| 不支持的云端写入副作用 | 1 |

详细记录：`<dataset>/metadata/excluded_tasks.jsonl`。

### 5.2 数据包内置 `verify_release.py` 检查内容

这个脚本是数据包自带的离线完整性工具，不是外部“官方校验”。它只使用 Python 标准库，并检查：

1. 根 `checksums.json` 中每个相对路径都不能逃逸发行根目录。
2. 每个声明文件必须存在，SHA-256 必须一致。
3. `task_index.jsonl`、`tasks.jsonl` 和 manifest 的发布数必须都是 1,868。
4. 排除任务数必须是 47。
5. `task_id` 全局唯一，`scenario_id` 全局唯一。
6. 已发布 scenario 与排除 scenario 不能重叠。
7. `task.json.id`、`environment.task_id`、索引 `task_id` 必须一致。
8. `tasks.jsonl` 中的公开指令必须与任务包中的 `task.json.task` 一致。
9. 包内 `validation_report.status` 必须为 `passed`。
10. 每个包的 `checksums.json` 必须逐文件匹配。
11. 材料数量必须与索引一致。
12. 每份材料的 SHA-256 和字节数必须与 manifest 一致。

运行：

```powershell
cd trajectory_gen\syn_tasks\eduagentworld_taskset_v1_1868_20261002
py -3 verify_release.py
```

当前预期输出：

```json
{"status":"passed","tasks":1868,"excluded":47,"material_files":3444}
```

### 5.3 包级静态 `validation_report` 检查项

每个包可能包含以下检查项：

- `persona_contract`：persona 符合 Career Agent 画像契约。
- `material_payload_schemas`：材料 payload 满足声明 schema。
- `persona_material_consistency`：画像事实与材料不冲突。
- `tool_input_json_schemas`：静态工具输入满足 JSON schema。
- `virtual_filesystem_semantics`：逻辑路径和虚拟文件系统语义合法。
- `resource_temporal_closure`：资源在声明时间点闭包。
- `material_consumer_closure`：必需材料都有声明消费者。
- `environment_state_seed_schemas`：存在状态种子时 schema 合法。
- `query_environment_consistency`：公开指令与环境声明一致。
- `persona_seed_inheritance`：画像继承关系一致。
- `task_tool_alignment`：交付物关键词与任务族/terminal tool 的静态对齐。

这些检查不运行工具，也不理解工具 `SKILL.md` 的全部负面能力边界，因此不能替代真实轨迹和人工语义检查。

## 6. 阶段 B：任务选择与请求物化

入口：`scripts/prepare-syn-task-runs.ts`。

### 6.1 选择任务

任务包按 `scenario_id` 排序，用 1-based ordinal 选择：

```powershell
# 列出编号和 scenario_id
bun trajectory_gen/scripts/prepare-syn-task-runs.ts --list

# 支持单条、闭区间、开放区间、离散组合和全部
bun trajectory_gen/scripts/prepare-syn-task-runs.ts --range 7
bun trajectory_gen/scripts/prepare-syn-task-runs.ts --range 1-100
bun trajectory_gen/scripts/prepare-syn-task-runs.ts --range 101-
bun trajectory_gen/scripts/prepare-syn-task-runs.ts --range 1,3,5-9
bun trajectory_gen/scripts/prepare-syn-task-runs.ts --range all
```

不传 `--range` 时只物化当前任务集中的两条 smoke task，避免误跑全量。

### 6.2 物化时的硬检查

每条任务在写入 request 前检查：

1. `environment.task_id === task.id`。
2. `task.scenario_id === 当前目录名`。
3. `invocation_bindings.task_id === task.id`。
4. binding schema 必须是 `eduagentworld.invocation_bindings.v1`。
5. 预期工具序列不能为空，所有工具名必须是非空字符串。
6. persona 必须通过 `validateEduAgentWorldPersona`。
7. 所有引用路径必须为相对路径，解析后不得逃逸任务包。
8. `material.logical_path` 必须严格等于 `/workspace/<package_path>`。
9. 材料实际字节数和 SHA-256 必须匹配 manifest。
10. 材料必须是 canonical UTF-8，重新编码后字节不得变化。
11. 生成的 CreateRun request 必须通过 Gateway `validateCreateRun`。
12. 同一 request 还必须通过后端 `validateTrainingInput`。
13. 模型可见请求中不得出现 `invocation_bindings`、`validation_witness_arguments` 或内部工具 ID。

### 6.3 query 如何组成

模型可见 query 由以下部分顺序拼接：

1. `task.json.task` 原始用户请求。
2. `available_inputs`，标题为“可用输入”。
3. `constraints`，标题为“约束”。
4. `deliverables`，标题为“交付要求”。
5. workspace 中材料的真实相对路径，并说明同名文件位于 `materials/` 而不是 workspace 根目录。

材料内容放进 `workspace.files`，不是直接粘进用户指令。

### 6.4 物化输出

```text
trajectory_gen/trajectories/syn-tasks/
  manifest.json
  requests/
    <scenario_id>.json
    <scenario_id>.expectations.json
```

- `.json`：模型可见的公开运行请求。
- `.expectations.json`：只供教师指引和运行后质检使用，包含预期工具名序列。
- `manifest.json`：本次范围、ordinal、scenario、请求文件、画像字段数和材料摘要。

## 7. 阶段 C：隔离执行真实 Career Agent

### 7.1 Windows 批量入口

```powershell
pwsh trajectory_gen/scripts/run-syn-task-trajectories.ps1 -Range 1-100
```

可选参数：

- `-EnvFile`：默认 `Gateway/.env.training`。
- `-Range`：任务 ordinal 范围。
- `-Cleanup`：导出完成后删除 Gateway/后端临时 Run 状态；不会删除本地导出结果。

### 7.2 WSL 隔离入口

```bash
RANGE=1-100 bash trajectory_gen/scripts/run-syn-task-trajectories-wsl-isolated.sh
```

隔离脚本会：

1. 只允许清理 `$HOME/career-agent-trace-runtime*` 下的运行目录。
2. 清理隔离运行时中的后端用户、文件、数据和 Gateway 数据。
3. 在复制仓库前物化所选任务。
4. 不复制 `.git`、`node_modules`、源任务集、历史 run 和用户数据。
5. 在隔离目录安装锁定依赖。
6. 使用独立训练数据库。
7. 把最终轨迹写回源仓库的 `trajectory_gen/trajectories/syn-tasks/runs/`。

### 7.3 单条运行的资源上限

物化器当前为每条任务设置：

- `timeoutMs = 1,200,000`：Agent 执行上限 20 分钟。
- `maxModelCalls = 150`。
- `maxUserQuestions = 20`。

runner 在任务 timeout 之外额外给 30 秒用于状态收尾。

### 7.4 后端隔离内容

每条 run 由训练 harness 单独创建并绑定：

- user；
- product profile；
- workspace；
- conversation；
- Gateway session。

输入材料在 Agent 启动前写入 workspace。正常批处理不会共用用户目录、conversation 或 session。

### 7.5 模拟用户

如果 Agent 调用询问用户的工具，Gateway user simulator 根据公开任务、画像和可见对话回答。模拟用户事件记录为 `user.answer`。它不读取 evaluator sidecar，也不能看到私有工具预期。

## 8. 私有教师工具指引与泄漏隔离

当 `.expectations.json` 存在时，runner 会构造私有教师指引，要求教师模型：

- 按编号顺序执行 binding 中的必需工具；
- 每个规划轮次只调用一个编号步骤；
- deferred tool 先通过 ToolSearch 加载；
- 工具参数必须是严格 JSON object；
- 不用通用 Read/Write 代替要求的领域工具；
- 允许在必需步骤之外调用辅助工具。

这段指引通过经过认证的 `x-private-planner-guidance` 请求头传给 Gateway。Gateway 只把它注入发往上游教师模型的请求：

- 捕获并保存的 `model.request` 会移除私有指引；
- 捕获的响应会移除私有 reasoning；
- 原始模型流在私有指引模式下不持久化；
- 如果模型在可见回答中复述私有指引，会记录 `capture.rejected/private_guidance_echo` 并拒绝运行。

导出后 runner 还会再次扫描所有 events、calls、messages 和 Qwen 输出，禁止出现：

- `invocation_bindings`；
- `validation_witness_arguments`；
- `input_schema_sha256`；
- 内部 `network.conversation:skill_tool:` 标识；
- `private-teacher-guidance`；
- `teacher-only policy`。

## 9. 事件采集与不可变日志

只捕获身份明确的主 Agent policy 调用。核心事件包括：

- `model.request`；
- `model.response`；
- `tool.call`；
- `tool.result`；
- `training.tokens`；
- `user.answer`；
- `capture.rejected`；
- `limit.exceeded`。

关键约束：

1. `agentRole` 必须为 `main`，`purpose` 必须为 `policy`。
2. 主 Agent 不能带 `parentAgentId`。
3. request ID、toolUseId 和 Gateway session 必须对应当前 run。
4. model request 必须带对象形式 body。
5. model response 必须有整数 HTTP status 和布尔 `complete`。
6. tool call 必须有工具名和对象形式 input。
7. tool result 必须有 content 和布尔 `isError`。
8. 同一 tool result 重复投递时内容必须完全相同，否则报冲突。
9. Conversation Memory marker 到达模型边界时直接拒绝，并记录 `capture.rejected`。
10. 非法工具参数直接拒绝，并记录 `capture.rejected/invalid_tool_arguments`。
11. 达到模型调用上限时记录 `limit.exceeded`。

事件采用 append-only JSONL：

- 每次 append 后执行文件同步，再向调用方确认成功。
- event sequence 必须从 1 连续递增。
- event ID 不得冲突；重复 ID 只有内容完全一致时才视为幂等。
- finalize 时写入 event count 和整份事件日志 SHA-256。
- finalize 后日志不可再修改。
- 已封存日志重新读取时会复核 count 和 SHA-256。

## 10. 质检门总览

| 层级 | 主要字段 | 检查对象 | 是否直接控制训练 JSONL |
|---|---|---|---|
| 任务发行门 | `validation_report.status` | 任务包静态结构和闭包 | 间接，物化前置条件 |
| 可选引擎 token 接口 | 原始导出中的 `trainingReady`、`reasons` | 引擎 token、事件配对、finalize | 不参与文本 SFT 合成判定，不在合成摘要/查看器展示 |
| 消息/Qwen 门 | `structuralSftReady`、Qwen `issues` | 对话投影和 Qwen3.5 格式 | 是 |
| 工具语义门 | `semanticAudit.accepted` | binding 必需工具及相对顺序 | 是 |
| 最终门 | `sftReady` | Qwen 门 AND 语义门 | 是 |

## 11. 可选推理引擎 token 导出检查

以下为底层 `trainingExport` 的高级接口契约，普通文本 SFT 合成已不展示或要求此检查。需要原始推理 token 数据时，该接口会产生 `trainingReady` 和 `reasons`，以下任一原因都会使它为 false：

| reason | 含义 |
|---|---|
| `not_finalized` | 日志尚未封存 |
| `run_not_completed` | Run 状态不是 completed |
| `no_policy_requests` | 没有捕获主 Agent policy 请求 |
| `duplicate_tool_call` | toolUseId 重复调用 |
| `duplicate_tool_result` | toolUseId 重复结果 |
| `tool_result_before_call` | 结果出现在调用之前 |
| `incomplete_policy_call` | 每个 request 没有且仅有一个成功完整 response |
| `invalid_policy_response_order_or_protocol` | response 顺序或协议与 request 不一致 |
| `missing_or_duplicate_tokens` | request 没有且仅有一个 token 记录 |
| `orphan_policy_data` | response/token 找不到对应 request |
| `missing_tool_result` | tool call 没有结果 |
| `orphan_tool_result` | tool result 没有调用 |
| `mixed_model_or_tokenizer_versions` | 同一 run 混入不同模型或 tokenizer 版本 |
| `capture.rejected` | 捕获层主动拒绝过事件 |
| `limit.exceeded` | 达到运行限制 |

### 11.1 token 记录还会检查

- 来源必须是 `inference_engine`。
- 必须有非空 `modelVersion` 和 `tokenizerVersion`。
- `tokenIds` 必须为非空安全非负整数数组，最多 1,000,000 个。
- `promptTokenCount` 必须落在 token 数组范围内。
- `lossMask` 长度必须一致；prompt 区间全部为 0，completion 区间全部为 1。
- `logprobs` 长度必须一致；prompt 区间为 null，completion 区间为有限且不大于 0 的数字。

## 12. messages 和 Qwen3.5 结构门

### 12.1 单轮 calls 投影

`messages` 导出会逐个主 Agent request 保存：

- 当轮请求 body；
- 对应 assistant response；
- usage；
- 该 request 触发的 tool calls；
- 每个 tool call 对应的结果。

会报告重复 request ID、response 解码失败、不完整 response、缺失或重复 tool result。

### 12.2 单一对话 `messages_list` 检查

系统不会凭空拼接被重写的历史。以下问题会让 `messages_list = null`：

- `context_rewritten_use_per_call_messages`：后续请求不是前一轮上下文的追加扩展。
- `system_context_changed`：system prompt 在轮次间改变。
- `assistant_history_mismatch`：捕获输出与后续历史位置不一致。
- `unsupported_request_messages`：请求消息结构不支持。
- `duplicate_request_id`：请求 ID 重复。
- `invalid_request_tools`：工具 schema 不是可解析数组。
- `tool_schema_changed:<name>`：同名工具 schema 在不同轮次变化。

动态加载的工具 schema 会合并进最终工具表，但同名定义必须保持一致。

### 12.3 Qwen3.5 导出检查

Qwen 导出目标格式是 `ms-swift.qwen3_5.sft.v1`，使用 `qwen3_5` agent template。它会：

- 将 assistant tool use 转成 `tool_call`；
- 将结果转成 `tool_response`；
- 过滤内部用户标记 `Tool loaded.`；
- 保留支持的 assistant reasoning 为 `<think>...</think>`；
- 合并运行中动态出现的工具 schema。

以下问题会使 `qwen.sftReady=false`，且 `messages=null`：

- 源 `messages_list` 不可用或为空；
- 消息、role、assistant block、user block 或 content 类型不支持；
- 工具参数不是合法 JSON object；
- 工具调用缺名称或参数非法；
- 最后一条不是带可见正文的 assistant 最终回答；
- `tool_call` 和 `tool_response` 数量不平衡；
- tools 不是合法数组；
- 调用了未捕获 schema 的工具；
- 上一节列出的上下文重写、system 变化、schema 变化等消息投影问题。

`summary.structuralSftReady` 就是这里的 `qwen.sftReady`。

## 13. binding 工具语义门

入口：`scripts/lib/semantic-audit.ts`。

### 13.1 当前实际规则

设 binding 预期序列为：

```text
A → B → C
```

实际工具调用：

```text
X → A → Y → B → C → Z
```

会通过，因为 A、B、C 都出现并保持相对顺序。额外辅助工具 X、Y、Z 被允许。

以下情况拒绝：

```text
A → C                  # 缺 B
A → C → B              # B、C 顺序颠倒
B → A → C              # A、B 顺序颠倒
```

实现同时计算：

- `expectedCallCount`：binding 中必需调用总数；
- `matchedCallCount`：按顺序匹配到的数量；
- `missingCallCount`：按工具名多重集合计算的缺失数量；
- `orderValid`：整个预期序列是否为实际调用的有序子序列；
- `issues`：`expected_tool_calls_missing` 或 `expected_tool_order_mismatch`。

### 13.2 当前没有阈值

目前是零容忍门：缺一个必需工具，或任意两个必需步骤相对顺序错误，就会 `semanticAudit.accepted=false`。

当前没有：

- 匹配比例阈值；
- 按 terminal tool 加权；
- 允许少量错序的编辑距离；
- “保留为训练样本但降低权重”的等级。

不通过的轨迹不会被删除，仍会完整保存在 run 目录供 viewer 检查。正式训练文件 `*.qwen3_5_sft.jsonl` 只为通过样本生成；未通过样本会单独写为 `*.qwen3_5_sft.rejected.jsonl`，并在 validation sidecar 中明确标记 `trainingEligible=false`，避免被训练管道误收。

## 14. 最终判定、退出码与失败保留

### 14.1 最终字段

`summary.json` 记录：

- `status`：真实 run 状态；
- `eventCount`、`callCount`；
- `artifactCount` 和产物列表；
- `structuralSftReady`；
- `semanticAudit`；
- `sftIssues`；
- `sftReady`；
- `validationStatus`：`passed` 或 `rejected`；
- `retained`：正常导出后恒为 `true`；
- `validationReport`：独立质检标记文件；
- `qwenJsonl`：未通过时为 null。
- `rejectedQwenJsonl`：未通过时指向隔离保存的轨迹 JSONL。

### 14.2 文件保留策略

无论最终 `sftReady` 是否通过，只要运行进入正常导出阶段，都会保留：

- events；
- calls；
- messages；
- Qwen 检查 JSON；
- run snapshot；
- summary；
- workspace 产物和最终回答。

所有正常导出的轨迹还会生成：

```text
<runId>.validation.json
```

只有 `sftReady=true` 时才生成正式训练文件：

```text
<runId>.qwen3_5_sft.jsonl
```

未通过时生成隔离文件：

```text
<runId>.qwen3_5_sft.rejected.jsonl
```

该文件保留结构化 messages、tools 和完整质检标签，但文件名明确包含 `rejected`，不得由正式训练数据 glob 收入。

如果目录中残留旧训练 JSONL，而新一轮没有通过，runner 会删除旧 JSONL，避免误用。

### 14.3 退出码

- `0`：run completed 且最终 `sftReady=true`。
- `1`：任务运行结束但没有满足最终轨迹/SFT 验收；批量 runner 会记录 rejected 并继续后续任务。
- `2`：配置、请求、Gateway、文件或其他运行级错误。

批次中存在任意 rejected 时，批次最终返回非零，但不会因单条失败提前停止。

## 15. 生成文件和 artifact 检查

每条任务使用稳定目录：

```text
trajectory_gen/trajectories/syn-tasks/runs/<scenario_id>/
```

典型内容：

```text
run.json
summary.json
artifacts.json
artifacts/
  _final_response.md
  <Agent 创建或修改的文件>
<runId>.events.json
<runId>.calls.json
<runId>.messages.json
<runId>.qwen3_5_sft.json
<runId>.qwen3_5_sft.jsonl       # 仅最终通过时存在
<runId>.qwen3_5_sft.rejected.jsonl # 仅未通过时存在，隔离保存
<runId>.validation.json         # 明确记录 passed/rejected 与原因
```

artifact 导出检查：

1. workspace root 必须来自当前 run 的 harness binding。
2. 所有导出相对路径必须留在 workspace 内。
3. symlink 直接拒绝。
4. 与初始材料 SHA-256 相同的文件不重复导出。
5. 最多 200 个变更文件。
6. 单文件最大 10 MiB。
7. 全部变更文件最大约 50 MiB。
8. 每个产物记录 path、bytes、SHA-256、source 和 created/modified。
9. 如果 workspace 已不可访问，会尝试从成功的 `Write` tool event 恢复文件。
10. 最终可见回复非空时，另存为 `artifacts/_final_response.md`。

artifact 导出错误会写入 `artifactWorkspaceError`，不会伪装成成功导出。

## 16. 跳过、重跑和清理

一条任务只有同时满足以下条件才会被后续批次跳过：

1. `summary.status === "completed"`；
2. `summary.sftReady === true`；
3. `summary.semanticAudit.accepted !== false`；
4. `<runId>.qwen3_5_sft.jsonl` 实际存在。

因此：

- 未完成任务会重跑；
- 结构通过但 semantic audit 失败的任务会重跑；
- summary 声称通过但 JSONL 缺失的任务会重跑；
- 已完成且合格的任务不会再次调用模型。

`-Cleanup` / `CLEANUP=1` 只清理 Gateway 和后端中的临时 run 资源。本地稳定输出目录仍保留。

## 17. 查看任务与轨迹

启动 viewer：

```powershell
.\trajectory_gen\scripts\start-viewer.ps1
```

```bash
bash trajectory_gen/scripts/start-viewer.sh 8791
```

打开 `http://127.0.0.1:8791`。

### 17.1 “任务检查”页

用于在生成轨迹前检查源任务：

- 按任务集筛选；
- 按标题、task ID、scenario ID 或指令正文搜索；
- 只返回 Top 10，不把全部任务发到浏览器；
- 可从本地选择单个任务包目录；
- 展示任务指令、交付物、验收标准、约束、工具链、材料正文、画像、环境和静态 audit；
- 有已有轨迹时可直接跳转。

### 17.2 “轨迹检查”页

用于检查已生成 run：

- 已过和未过最终质检的轨迹都能查看；
- 没有可用 Qwen messages 时从 authoritative events 回退重建时间线；
- 展示 token、模型轮次、工具调用/结果、事件完整性、语义门、tool inventory、材料和生成产物；
- 可显示或隐藏捕获到的 reasoning。

## 18. 只重导出 Qwen 文件

如果事件日志正确，只修改了 exporter，不需要重新调用模型：

```bash
bun trajectory_gen/scripts/reexport-qwen.ts \
  --run-id <uuid> \
  --trace-dir <Gateway trace directory> \
  --output trajectory_gen/trajectories/syn-tasks/runs/<scenario_id>
```

重导出要求：

- `summary.runId` 与参数一致；
- 旧 `semanticAudit.accepted === true`；
- 新 Qwen 导出结构通过；
- messages 是数组，tools 是字符串；
- 不含私有教师信息、binding metadata 或 `Tool loaded.` 控制面标记。

该操作不修改权威事件日志。

## 19. 建议的发布前人工检查

自动门之后仍建议按任务族分层抽样，至少检查：

1. 用户指令是否自然、明确、没有奇怪领域或合成残留。
2. 指令要求的动作是“生成、审阅、修订、核验”中的哪一种，terminal tool 是否真的支持。
3. 必需前置工具是否存在，例如格式修订前是否生成格式检查报告。
4. 工具 `SKILL.md` 的负面边界是否允许完整交付物。
5. 是否要求尚未发生的学习成绩、访谈结果、联系回复等，从而诱导模型虚构。
6. WebSearch 是否真的需要外部或时效性事实。
7. PDF、DOCX、云写入、发送、提交等副作用是否由现有工具支持。
8. 工具参数是否来自用户指令、画像、材料或上游输出，而不是 witness 泄漏。
9. 最终回答是否真实反映工具 observation，是否声称执行了未执行动作。
10. 失败轨迹是否只是 binding 顺序不一致，还是实际任务质量也有问题。

可疑领域任务清单见 [`reports/SUSPICIOUS_TASK_REVIEW.md`](reports/SUSPICIOUS_TASK_REVIEW.md)。

## 20. 已知限制

- 上游静态 `task_tool_alignment` 主要基于任务族和交付关键词，不能完整理解 skill 的 scope、hard boundary 和前置输入。
- semantic audit 当前要求所有 binding 必需步骤保持相对顺序，没有阈值或软评分。
- semantic audit 只检查工具名及顺序，不直接评价每个参数和 observation 的业务质量。
- 普通文本 SFT 不要求生成模型的引擎 token 记录；在训练端使用目标模型的 tokenizer。合成成功仍需运行完成、Qwen 结构门与工具语义门通过。
- Qwen 结构门允许合法的 `<think>` 内容；如果目标是严格 Plan-only 数据，仍需额外决定是否清洗或剔除 reasoning。
- 外部网页、招聘机会和组织状态会变化，静态任务通过不代表运行时仍可访问。
- 自动检查不等价于人工判断职业题材、真实性、合规性和实际交付质量。

## 21. 主要维护入口

| 想修改的内容 | 代码位置 |
|---|---|
| 默认任务集、范围、query 和材料物化 | `scripts/prepare-syn-task-runs.ts` |
| 单条运行、私有教师指引、最终门和 artifact | `scripts/run-backend-trajectory.ts` |
| binding 顺序判定 | `scripts/lib/semantic-audit.ts` |
| 批量跳过条件 | `scripts/check-completed-task.ts` |
| Windows 批处理 | `scripts/run-backend-trajectory.ps1`、`scripts/run-syn-task-trajectories.ps1` |
| WSL 隔离运行 | `scripts/run-syn-task-trajectories-wsl-isolated.sh` |
| 事件封存和不可变日志 | `Gateway/src/trajectories/trace-store.ts` |
| trainingReady | `Gateway/src/training/export.ts` |
| messages/Qwen 导出 | `Gateway/src/training/messages.ts` |
| 模型代理、私有指引和捕获拒绝 | `Gateway/src/proxy/model-proxy.ts` |
| 后端隔离执行 | `CrescoAI-Backend/backend/src/Network/modules/training-harness/` |
| 任务与轨迹查看器 | `viewer/server.mjs`、`viewer/public/` |

更细的函数级导航、数据流和测试位置见 [`CODEMAP.md`](CODEMAP.md)。
