# Network Tool Manifest

> 此文件由 `scripts/generate-network-tool-manifest-readme.ts` 根据 `network-tool-manifest.json` 自动生成，请勿直接编辑。

这份 README 面向依赖关系图生成方，用来快速确认清单边界、统计口径和字段语义。JSON 是机器可读的事实来源；README 是它的可读索引。

## 快速结论

| 指标 | 值 |
| --- | --- |
| Manifest 版本 | `1.0` |
| 生成时间 | `2026-08-27T17:57:08.187Z` |
| 源码版本 | `feat/skill-e2e-runtime` / `def303721b73`（dirty） |
| Tool 记录数 | 33 |
| 不同 Tool 名称数 | 31 |
| Harness Tool | 28 |
| Skill Tool | 5 |
| Resource 数 | 14 |
| 带 Resource I/O 的 Tool | 20 |
| 缺少 output_schema 的 Tool | 1 |
| 排除 Tool 数 | 3 |
| Warning 数 | 0 |
| 包含 MCP Tool | `false` |

注意：`tools.length` 是上下文化后的 Tool 记录数，不等于唯一名称数。同名 Tool（目前主要是 Profile Tool）可因 context/schema namespace 不同而有不同合约，建图应使用 `tools[].id` 作为节点 ID。

## 范围与生成假设

| 项目 | 值 |
| --- | --- |
| Contexts | `network.conversation`, `network.profile_refresh` |
| MCP | 明确排除 |
| Permission mode | `allow_all` |
| Tool Search mode | `tst` |
| Tool Search loading | `for_supported_models` |
| Prompt contract context | `api_key_user` |

清单描述的是上述假设下由 Network 层实际组装并暴露的非 MCP Tool。它不是对 `src/tools` 目录或静态注册表的简单枚举。

## 统计分布

### 按 Context

| 分类 | 数量 |
| --- | --- |
| `network.conversation` | 31 |
| `network.profile_refresh` | 2 |

### 按 Tool 类型

| 分类 | 数量 |
| --- | --- |
| `harness_tool` | 28 |
| `skill_tool` | 5 |

### 按 Availability

| 分类 | 数量 |
| --- | --- |
| `available` | 32 |
| `conditional` | 1 |

### 按 Loading

| 分类 | 数量 |
| --- | --- |
| `deferred` | 7 |
| `eager` | 26 |

### 按源码类型

| 分类 | 数量 |
| --- | --- |
| `builtin` | 24 |
| `generated_skill_action` | 5 |
| `service` | 4 |

### Resource 类型

| 分类 | 数量 |
| --- | --- |
| `artifact` | 5 |
| `handle` | 2 |
| `snapshot` | 3 |
| `state` | 4 |

### Resource I/O 边

| 边类型 | 数量 |
| --- | --- |
| `consumes` | 11 |
| `produces` | 11 |
| `reads` | 7 |
| `writes` | 8 |

## 如何用于建图

1. 每条 `tools[]` 记录建立一个 Tool 节点，节点主键使用 `id`，不要只用 `name`。

2. 每条 `resources[]` 记录建立一个 Resource 节点，主键使用 `id`。

3. 从 `resource_io.consumes/produces/reads/writes` 建立四类 Tool—Resource 边；边上的 `when`、`produced_when`、`requirement`、`resolution`、`binding` 等属性应保留。

4. `harness_tool` 与 `skill_tool` 在图中都作为 Tool；`tool_type` 和 `skill_binding` 只用于追溯来源或分组。

5. `availability` 只处理平台/运行时门槛。业务资源是否具备，应根据 `input_schema` 和 `resource_io` 判断。

6. 此 JSON 不声明 Tool—Tool 直接依赖边。若需要该类边，应由建图方根据 Resource 路径或其他规则派生，不能把数组顺序当作依赖顺序。

I/O 缩写：`C` = consumes，`P` = produces，`R` = reads，`W` = writes。

## Tool 索引

| ID | 名称 | 类型 | Context | Availability | Loading | Resource I/O |
| --- | --- | --- | --- | --- | --- | --- |
| `network.conversation:harness_tool:ActivateLearningPlan` | `ActivateLearningPlan` | `harness_tool` | `network.conversation` | `available` | `eager` | `C1/P0/R0/W1` |
| `network.conversation:harness_tool:AskUserQuestion` | `AskUserQuestion` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P0/R0/W0` |
| `network.conversation:skill_tool:BaselineAssessment` | `BaselineAssessment` | `skill_tool` | `network.conversation` | `available` | `eager` | `C0/P1/R0/W0` |
| `network.conversation:harness_tool:Bash` | `Bash` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P1/R0/W0` |
| `network.conversation:skill_tool:CareerCompetencyModel` | `CareerCompetencyModel` | `skill_tool` | `network.conversation` | `available` | `eager` | `C0/P1/R0/W0` |
| `network.conversation:harness_tool:Edit` | `Edit` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:EnterPlanMode` | `EnterPlanMode` | `harness_tool` | `network.conversation` | `available` | `deferred` | `C0/P0/R0/W1` |
| `network.conversation:harness_tool:ExitPlanMode` | `ExitPlanMode` | `harness_tool` | `network.conversation` | `available` | `deferred` | `C0/P0/R1/W1` |
| `network.conversation:harness_tool:GetLearningState` | `GetLearningState` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P1/R1/W0` |
| `network.conversation:harness_tool:Glob` | `Glob` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:Grep` | `Grep` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:ImageGenerate` | `ImageGenerate` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P0/R0/W0` |
| `network.conversation:skill_tool:LearningPlan` | `LearningPlan` | `skill_tool` | `network.conversation` | `available` | `eager` | `C2/P1/R0/W0` |
| `network.conversation:skill_tool:LearningProgressAssessment` | `LearningProgressAssessment` | `skill_tool` | `network.conversation` | `available` | `eager` | `C1/P1/R1/W0` |
| `network.conversation:skill_tool:LearningStageDesign` | `LearningStageDesign` | `skill_tool` | `network.conversation` | `available` | `eager` | `C1/P1/R1/W0` |
| `network.conversation:harness_tool:NotebookEdit` | `NotebookEdit` | `harness_tool` | `network.conversation` | `available` | `deferred` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:Read` | `Read` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:ReturnSkillResult` | `ReturnSkillResult` | `harness_tool` | `network.conversation` | `available` | `eager` | `C1/P0/R0/W1` |
| `network.conversation:harness_tool:Skill` | `Skill` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P1/R0/W0` |
| `network.conversation:harness_tool:TaskOutput` | `TaskOutput` | `harness_tool` | `network.conversation` | `available` | `deferred` | `C1/P0/R0/W0` |
| `network.conversation:harness_tool:TaskStop` | `TaskStop` | `harness_tool` | `network.conversation` | `available` | `deferred` | `C1/P0/R0/W0` |
| `network.conversation:harness_tool:TodoWrite` | `TodoWrite` | `harness_tool` | `network.conversation` | `available` | `deferred` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:ToolSearch` | `ToolSearch` | `harness_tool` | `network.conversation` | `conditional` | `eager` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:UpdateLearningPlan` | `UpdateLearningPlan` | `harness_tool` | `network.conversation` | `available` | `eager` | `C1/P1/R1/W1` |
| `network.conversation:harness_tool:UpdateLearningProgress` | `UpdateLearningProgress` | `harness_tool` | `network.conversation` | `available` | `eager` | `C2/P0/R0/W1` |
| `network.conversation:harness_tool:VideoGenerate` | `VideoGenerate` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:WebFetch` | `WebFetch` | `harness_tool` | `network.conversation` | `available` | `deferred` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:WebSearch` | `WebSearch` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:Write` | `Write` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P0/R0/W0` |
| `network.conversation:harness_tool:profile_read:product-profile-interactive` | `profile_read` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P1/R1/W0` |
| `network.conversation:harness_tool:profile_update:product-profile-interactive` | `profile_update` | `harness_tool` | `network.conversation` | `available` | `eager` | `C0/P0/R0/W1` |
| `network.profile_refresh:harness_tool:profile_read:product-profile-refresh` | `profile_read` | `harness_tool` | `network.profile_refresh` | `available` | `eager` | `C0/P1/R1/W0` |
| `network.profile_refresh:harness_tool:profile_update:product-profile-refresh` | `profile_update` | `harness_tool` | `network.profile_refresh` | `available` | `eager` | `C0/P0/R0/W1` |

## Skill Tool 绑定

| Tool ID | Tool 名称 | 来源 Skill | 入口模式 |
| --- | --- | --- | --- |
| `network.conversation:skill_tool:BaselineAssessment` | `BaselineAssessment` | `baseline-assessment` | `action-tool` |
| `network.conversation:skill_tool:CareerCompetencyModel` | `CareerCompetencyModel` | `career-competency-model` | `action-tool` |
| `network.conversation:skill_tool:LearningPlan` | `LearningPlan` | `learning-plan` | `action-tool` |
| `network.conversation:skill_tool:LearningProgressAssessment` | `LearningProgressAssessment` | `learning-progress-assessment` | `action-tool` |
| `network.conversation:skill_tool:LearningStageDesign` | `LearningStageDesign` | `learning-stage-design` | `action-tool` |

## Conditional Tool

| Tool ID | 条件类型 | 条件说明 |
| --- | --- | --- |
| `network.conversation:harness_tool:ToolSearch` | `model_capability` | The selected model must support tool_reference blocks. |
| `network.conversation:harness_tool:ToolSearch` | `tool_search_mode` | Tool search must not be disabled for the request provider. |

## Resource 目录

| ID | Kind | Scope | Persistence | Mutable | Versioned | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `artifact:BaselineAssessment@1.0` | `artifact` | `user` | `workspace` | `false` | `true` | A versioned assessment of the user evidence baseline for a target role, domain, or task. |
| `artifact:CareerCompetencyModel@1.0` | `artifact` | `user` | `workspace` | `false` | `true` | A source-backed model of current competency requirements for a career target. |
| `artifact:LearningPlan@1.0` | `artifact` | `user` | `workspace` | `false` | `true` | A versioned staged learning plan grounded in a competency model and baseline assessment. |
| `artifact:LearningStagePackage@1.0` | `artifact` | `user` | `workspace` | `false` | `true` | An executable package for the current stage of an activated learning plan. |
| `artifact:LearningProgressAssessment@1.0` | `artifact` | `user` | `workspace` | `false` | `true` | An assessment of visible evidence against the current learning stage rubric. |
| `state:LearningState@1.0` | `state` | `user` | `workspace` | `true` | `true` | The active learning-plan collection, focus plan, current stage, and progress state. |
| `state:ProductProfile` | `state` | `user` | `database` | `true` | `true` | The authenticated user career, education, and learning Profile. |
| `state:ProfileRefreshOverlay` | `state` | `job` | `job` | `true` | `false` | A job-local Profile snapshot plus staged mutations that are not directly persisted. |
| `state:PlanMode` | `state` | `conversation` | `session` | `true` | `false` | Whether the current conversation is in planning mode. |
| `handle:BackgroundTask` | `handle` | `session` | `process` | `true` | `false` | An opaque handle for a running or completed background task. |
| `handle:SkillInvocation` | `handle` | `conversation` | `session` | `true` | `false` | The lifecycle handle for an active prompt Skill invocation. |
| `snapshot:LearningState` | `snapshot` | `user` | `session` | `false` | `false` | A read-only view of the current LearningState returned to the model. |
| `snapshot:ProductProfile` | `snapshot` | `user` | `session` | `false` | `false` | A read-only product Profile view returned to the model. |
| `snapshot:ProfileRefreshOverlay` | `snapshot` | `job` | `job` | `false` | `false` | A read-only view of the current job-local Profile refresh overlay. |

## 排除项

| 名称 | Context | 执行层 | 原因 |
| --- | --- | --- | --- |
| `Agent` | `network.conversation` | `network_runtime` | Network QueryEngine is constructed with agents: []; the default agent type cannot be resolved. |
| `EnterWorktree` | `network.conversation` | `network_permission` | Network sessions are pinned to the user workspace and reject working-directory mutation. |
| `ExitWorktree` | `network.conversation` | `network_permission` | Network sessions are pinned to the user workspace and reject working-directory mutation. |

## Warnings

无。

## 合约缺口

以下 Tool 的源码没有声明 `output_schema`，JSON 中保留为 `null`，生成器不会猜测：

- `network.conversation:harness_tool:TaskOutput`

## 字段说明

### 顶层字段

| 字段 | 说明 |
| --- | --- |
| `manifest_version` | 清单格式版本；用于判断消费方是否支持当前 JSON 结构。 |
| `generated_at` | 本次有效内容首次生成的 ISO 8601 时间；内容未变化时保持不变。 |
| `source_revision` | 生成清单时对应的 Git 分支、提交和工作区脏状态。 |
| `scope` | 本清单覆盖的运行上下文以及生成时采用的环境假设。 |
| `resources` | Tool 会消费、产出、读取或写入的顶层资源目录。 |
| `tools` | 实际纳入清单的可用 Tool 记录；同名 Tool 在不同 context 下可有多条记录。 |
| `excluded_tools` | 注册过但经 Network 层判定不可用、因而未进入 tools 的审计记录。 |
| `warnings` | 生成时发现但未阻断产物输出的漂移或环境问题。 |

### `source_revision`

| 字段 | 说明 |
| --- | --- |
| `branch` | 生成时所在 Git 分支。 |
| `commit` | 生成时的 Git commit 标识。 |
| `dirty` | 生成时工作区是否存在未提交变化。 |

### `scope`

| 字段 | 说明 |
| --- | --- |
| `include_mcp` | 是否包含 MCP Tool；本清单固定为 `false`。 |
| `contexts` | 本清单实际枚举的 Network 运行上下文。 |
| `assumptions` | 为得到可复现 Tool 集而采用的权限、Tool Search 和 prompt 环境。 |

### `scope.assumptions`

| 字段 | 说明 |
| --- | --- |
| `permission_mode` | 生成 Tool 池时采用的权限模式。 |
| `tool_search_mode` | 生成环境解析出的 Tool Search 模式。 |
| `tool_search_loading` | Deferred Tool 适用于哪些模型能力条件。 |
| `prompt_contract_context` | 解析动态 Tool prompt 时模拟的认证上下文，不包含真实凭据。 |

### `tools[]`

| 字段 | 说明 |
| --- | --- |
| `id` | 图节点应优先使用的稳定标识；包含 context、tool_type、name，必要时包含 schema namespace。 |
| `name` | 暴露给模型的 Tool 名称；它不保证跨 context 唯一。 |
| `aliases` | Tool 可被检索或兼容识别的其他名称。 |
| `tool_type` | `harness_tool` 为原生 Harness Tool；`skill_tool` 为从 Skill 封装出的具体 Tool。建图时两者可同等处理。 |
| `skill_binding` | 仅 Skill Tool 非空，记录其来源 Skill 及封装入口模式。 |
| `context` | 该 Tool 实际可用的 Network 运行上下文。 |
| `schema_cache_namespace` | 区分同名但 schema 不同的 Tool 合约；不需要区分时为 `null`。 |
| `description` | 实际解析后的 Tool prompt/说明，可用于检索、选 Tool 或节点描述。 |
| `search_hint` | 面向 Tool Search 的短提示；没有独立提示时为 `null`。 |
| `input_schema` | Tool 输入的 JSON Schema。 |
| `output_schema` | Tool 输出的 JSON Schema；源码未声明时为 `null`，生成器不会猜测。 |
| `availability` | 平台/运行时层面的可用性；不表示业务数据是否已经准备好。 |
| `loading` | `eager` 直接进入 Tool 集；`deferred` 在支持 Tool Search 的模型中按需加载。 |
| `properties` | 只读性、破坏性、并发安全、交互要求和严格 schema 等执行属性。 |
| `resource_io` | 经过整理的语义资源 I/O，可直接转换为 Tool—Resource 边。 |
| `source` | Tool 的代码来源类型、文件和导出名。 |
| `schema_hash` | 输入/输出合约的 SHA-256 漂移指纹。 |

### `tools[].skill_binding`

| 字段 | 说明 |
| --- | --- |
| `skill_name` | 生成该具体 Tool 的 Skill 名称。 |
| `entry_mode` | Skill 被封装为 Tool 的入口模式；当前为 `action-tool`。 |

### `tools[].availability`

| 字段 | 说明 |
| --- | --- |
| `status` | `available` 表示在 scope/assumptions 下无额外平台门槛；`conditional` 表示必须满足 conditions。 |
| `conditions` | 平台、模型或运行时暴露条件。业务前置数据不放这里，而由 input_schema/resource_io 表达。 |

### `tools[].availability.conditions[]`

| 字段 | 说明 |
| --- | --- |
| `type` | 条件的机器可读类别。 |
| `description` | 条件的人类可读说明。 |

### `tools[].properties`

| 字段 | 说明 |
| --- | --- |
| `read_only` | 是否只读；`input_dependent` 表示取决于具体调用参数。 |
| `destructive` | 是否可能产生难恢复的副作用；`input_dependent` 表示取决于参数。 |
| `concurrency_safe` | 是否可与其他调用安全并行；`input_dependent` 表示取决于参数。 |
| `requires_user_interaction` | 执行过程中是否要求用户交互。 |
| `strict` | 是否按严格 schema 约束输入。 |

### `tools[].resource_io`

| 字段 | 说明 |
| --- | --- |
| `consumes` | 调用所需或在特定条件下使用的不可变/版本化输入资源。 |
| `produces` | 调用创建的新资源。 |
| `reads` | 调用读取的状态、快照或句柄。 |
| `writes` | 调用创建、变更或推进的状态/句柄。 |

### Resource binding

| 字段 | 说明 |
| --- | --- |
| `resource_id` | 指向顶层 resources[].id 的外键。 |
| `binding` | 资源与 Tool 输入/输出字段、引用格式之间的映射。 |
| `requirement` | `required_in_schema`、`required_semantically` 或 `optional`。 |
| `resolution` | 资源的解析来源，例如显式输入或上下文推导。 |
| `access` | 读取/写入动作的语义名称。 |
| `operations` | 当一个 Tool 支持多种资源操作时列出具体操作。 |
| `produced_when` | 满足指定输入条件时才产出该资源。 |
| `when` | 满足指定输入条件时该绑定才生效。 |

`binding`、`when` 和 `produced_when` 的内部键是面向具体 Tool 合约的开放映射，不是全局固定字段；消费方应原样保留。

### `tools[].source`

| 字段 | 说明 |
| --- | --- |
| `kind` | `builtin`、`service` 或 `generated_skill_action`。 |
| `file` | 相对于项目根目录的源码文件。 |
| `export` | 定义或创建该 Tool 的导出符号。 |

### `resources[]`

| 字段 | 说明 |
| --- | --- |
| `id` | 资源稳定标识，也是 resource_io 中使用的外键。 |
| `kind` | `artifact`、`state`、`handle` 或 `snapshot`。 |
| `resource_type` | 领域资源类型名称。 |
| `schema_version` | 资源 schema 版本；未独立版本化时为 `null`。 |
| `scope` | 资源所属范围：user、conversation、session 或 job。 |
| `persistence` | 资源实际持久化位置：workspace、database、session、process 或 job。 |
| `mutable` | 资源是否可原地变化。 |
| `versioned` | 资源是否显式版本化。 |
| `reference` | Tool 传递该资源时使用的引用格式；不通过引用传递时为 `null`。 |
| `description` | 资源的领域语义说明。 |
| `source` | 资源定义或语义整理所依据的源码位置。 |

### `resources[].reference`

| 字段 | 说明 |
| --- | --- |
| `format` | 引用值的格式，例如 `artifact://<uuid>` 或 `task_id`。 |
| `opaque` | 引用是否应被消费方当作不透明标识。 |

### `resources[].source`

| 字段 | 说明 |
| --- | --- |
| `kind` | `declared` 表示源码有明确领域定义；`curated` 表示由本清单整理语义。 |
| `file` | 资源定义或语义整理所依据的源码文件。 |

### `excluded_tools[]`

| 字段 | 说明 |
| --- | --- |
| `name` | 被排除的 Tool 名称。 |
| `context` | 排除发生的运行上下文。 |
| `reason` | 为什么注册存在但在该 Network 上下文不可用。 |
| `enforced_by` | 由 Network runtime 还是 permission 层执行排除。 |
| `source` | 被排除 Tool 的源码位置。 |

### `excluded_tools[].source`

| 字段 | 说明 |
| --- | --- |
| `file` | 被排除 Tool 的源码文件。 |
| `export` | 定义被排除 Tool 的导出符号。 |

## 自动生成边界

以下内容从 JSON 自动计算：所有统计数字、Tool 索引、Skill 绑定、Conditional Tool、Resource 目录、排除项和 warnings。字段中文说明是维护在生成器中的稳定语义文档，因为 JSON 本身无法解释字段的业务含义。生成器会检查实际出现的字段是否已有说明；遇到未记录的新字段会失败，避免 README 静默过期。

## 生成与校验

推荐同时生成或校验 JSON 与 README：

```bash
bun run network-tools:artifacts
bun run network-tools:artifacts:check
```

只处理已有 JSON 对应的 README：

```bash
bun run network-tools:readme
bun run network-tools:readme:check
```
