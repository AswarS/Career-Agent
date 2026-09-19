# 修改记录

## 2026-09-19 — Python 自动批跑测试 cases

- 新增 `scripts/batch_test_cases.py`，全部路径、地址、任务列表及运行参数集中固定在代码顶部；无需 CLI 参数，默认从固定配置文件读取令牌，亦可在代码中填写。
- 顺序提交 5 例，轮询、超时取消、保存 messages_list 数组、默认封存及汇总；单例失败继续，POST 不自动重试，保留创建未确认状态，Ctrl+C 尝试取消已知运行。
- 独立保存消息可用性、执行结果与 token 训练就绪信息，不将模型执行完成当作业务验收通过。保留实际用户 workspace 供检查。
- 使用本地模拟测试验证成功导出、失败导出、等待超时取消及创建请求不重试；未执行真实模型批跑。

## 2026-09-19 — 直接提供 messages_list

- 新增 `trajectory?format=messages_list` 和自动更新的 `<runId>.messages_list.json`，直接输出单一有序消息数组，去除重复历史并保留捕获的 reasoning 和工具结果。
- 每次事件追加后原子替换派生文件，无需运行后手动转换；原始事件日志保持不变。上下文改写不静默拼接，输出明确 issue 并要求使用逐调用格式。
- 已有 ace9f41d-e91f-4a17-93b2-91d5904f7418 轨迹已生成 25 条消息、11 次调用的 messages_list，issues 为空。

## 2026-09-19 — 实际流式日志的消息导出修正

- 实际日志同时包含 raw SSE、delta events 和已组装消息，原导出缺少独立消息格式，不能直接当作训练样本。
- 新增 `trajectory?format=messages`，按主 Agent 调用导出原始请求、已组装正文/reasoning/工具参数、usage 和工具结果，省略传输层原文与分片；默认事件格式保持兼容。
- 新增离线 `scripts/export-messages.ts`，原日志保持不变，输出拒绝覆盖。已将用户提供的 ace9f41d-e91f-4a17-93b2-91d5904f7418 日志转换为 11 次调用的消息快照，投影 issues 为空；快照没有运行结束事件及真实 token，未标记训练就绪。
- 验证消息合并、缺失响应、子 Agent 排除、Anthropic 块及失败工具结果保留，并回归事件存储与 API 测试。

## 2026-09-19 — 导入用户提供的 5 个测试任务

- 新增 `examples/cases/` 下 5 份可直接提交的请求、评估溯源索引及 CMD 使用说明；保留源任务包。
- 新增离线转换脚本 `scripts/convert-example-packages.ts`，校验 Gateway/后端输入及 7 份材料的 SHA-256 和字节数；材料内嵌后写入每次运行的真实用户 workspace。
- 将产品 v2 persona 映射为后端支持的 Profile 输入，并在摘要中保留完整原始画像事实；记录兼容表示不等于产品 v2 逐字段状态导入的限制。
- 模拟用户启用 `simulated-user`；不额外强制工具调用，不导入内部验证线索。验收标准置于请求外的索引中。
- 仅完成离线转换与校验，未调用真实模型或提交训练任务。

## 2026-09-19 — Windows 预检与配置错误诊断修正

- Bun 检测增加固定 `cmd.exe /d /s /c "bun --version"` 回退，支持 npm 安装生成的 bun.cmd；设置超时和隐藏窗口。
- 配置校验提供不含配置值的字段级 ConfigError，区分 JSON 格式、模型字段与 URL 错误；doctor 将配置错误与后端探测失败分开报告。
- 本机 `.env.training` 中两个模型配置存在字符串外的花括号非法转义，已移除，未输出或修改字符串内的凭据。真实配置文件保持 Git 忽略。
- 实际预检返回 bunAvailable/configValid/readyForServiceRun=true，后端 databaseReachable=true；未调用模型 API。
- 新增 3 项测试覆盖 Windows shim、原生命令、缺失运行时和诊断信息不泄漏配置值。该预检结果不代表真实训练任务或模型验证已完成。

## 2026-09-19 — 复用后端物理 workspace 修正

- 训练 harness 改为调用后端现有 `ensureNetworkUserWorkspaceDir`；目录准备和初始文件写入提前到 Profile/会话初始化之前。
- 共享入口增加训练专用的新用户目录检查：拒绝已有用户目录/上传目录及符号链接祖先，原子创建目录，避免迁入旧数据库残留文件。普通用户迁移行为保留；合法用户 ID 重用时清除旧目录缓存。
- 初始文件写入后从磁盘回读，核对原始字节并生成 SHA-256 清单；全部完成后才进入 ready。
- 会话注册携带实际准备目录；启动执行时检查物理路径，Agent 创建上下文时复用共享路径断言，拒绝项目根目录、其他用户目录或不一致的准备目录。
- 回滚继续复用 UserService：目录分配未确认成功时，仅回滚新建数据库用户，保留文件；成功分配后的清理沿用严格文件清理。目录创建中途发生文件系统故障时可能留有部分目录，不会据此删除归属未确认的文件。
- 新增 6 项验证，直接在后端真实 user/workspace 路径调用共享实现，覆盖双用户实际文件、二进制内容、Profile 前初始化、冲突/普通迁移、并发创建、缓存重建、禁止覆盖及运行目录断言。测试使用唯一测试 ID，未创建数据库用户，并清理本次测试目录。
- 全量测试 66 项通过；真实 NestJS/SDK 联调与静态类型检查仍未完成。

## 2026-09-19 — 阶段六工具交付 / 0.6.0（真实验收待完成）

### 修改范围

- 新增 `scripts/doctor.ts`：运行时、依赖、配置和后端就绪预检，不打印配置值或调用模型。
- 新增 `scripts/run-training.ts`、`src/workflow/run.ts` 和 `verify.ts`：自动启动 Gateway 或连接已有服务、双采样执行、workspace 证据与问答回填验证、隔离检查、封存导出及报告。
- 新增严格 token/Skill 验收开关、有限 token 等待、创建 ID 记录、失败/中断取消、可选显式清理；拒绝复用非空输出目录。
- Gateway 增加受鉴权的 `/v1/readiness`；后端增加训练服务 token 保护的只读 readiness 入口，SELECT 1 检查数据库可达性，返回固定字段。
- 新增 `.env.training.example`，忽略真实 `.env.*` 配置；扩展包脚本及 TypeScript 检查范围，更新版本和阶段说明。

### 验证记录

- `node --test Gateway/tests/*.test.ts`：60 项测试通过（新增 9 项工作流与就绪检查测试）。
- 本机实际运行 doctor：Node v24.19.0 可用；Bun、后端依赖、本地 TypeScript 编译器、训练后端/主模型/User 模型配置均未具备，readyForServiceRun=false。见 phase6-local-validation.json。
- 工作流自动测试使用本地 HTTP 替身，未启动真实 NestJS/数据库或访问外部推理服务。没有创建真实训练用户或执行实际模型调用。
- 静态类型检查和真实 Skill/推理 token 生产方验收未完成，不能用自动测试通过代替真实端到端验收。

### 尚需外部条件

提供已有训练后端及模型环境的地址和本机配置文件路径，或在依赖完整的环境按 PHASE6 准备并运行；收集真实 report.json 后才能完成阶段六整体验收。

## 2026-09-19 — 阶段五 / 0.5.0

### 修改范围

- `src/trajectories/trace-store.ts` 升级为版本化 JSONL 事件日志：事件 ID 幂等/冲突检测、序号、file.sync 后确认、写入失败保持失败、游标读取与恢复校验。
- 新增事件收发、有限分页 SSE、完整轨迹导出及 finalize 接口。封存等待本地执行/回答/代理结束，通过临时文件 sync + rename 发布 SHA-256 清单；新事件不可写入已封存轨迹。
- 新增 `src/training/export.ts`，校验真实 engine tokenIds/logprobs/版本/前缀边界/lossMask，并检查请求响应、工具结果、运行终态和完整性，输出 samples、trainingReady、reasons。
- 模型代理向上游提供主 Agent run/request 关联 ID，供受信推理生产方补交 token；内部 session 凭据不传给上游。模型、工具及 User 答案统一使用事件日志。
- 已封存归档可在 Gateway 重启后读取；未封存日志末尾不完整行可恢复，完整行损坏或封存校验不一致拒绝读取。旧诊断 JSONL 保留，不自动迁移。
- 更新 contracts、能力声明、版本、README/API/架构说明，新增 PHASE5 接入文档。诊断 trace 兼容视图保留。

### 验证记录

- `node --test Gateway/tests/*.test.ts`：51 项测试通过，新增阶段五 12 项，保留前四阶段回归。
- 覆盖去重冲突、并发/封存屏障、重启读档、断行恢复、损坏与写入失败、token/mask 校验、主 Agent/Memory 过滤、请求/工具完整性、鉴权 HTTP 与游标 SSE。
- 代理测试补充实际主请求关联 ID、子/辅助请求不携带该 ID，以及按请求补交 mock engine token 后封存导出的闭环。
- 没有启动真实 NestJS/数据库或外部推理引擎；token 测试使用明确标识的 mock 数据。静态类型检查仍受本机缺少完整依赖/TypeScript 编译器限制。

### 限制与阶段六交接

- 每个目录仅支持单个 Gateway 写入进程；没有跨进程锁、日志配额/压缩、任务执行恢复或多副本协调。单 run 日志读取使用内存。
- 文件 sync 与原子 rename 不等于所有系统的断电目录项持久保证；恢复时拒绝损坏，不伪造成功。
- token 接入信任受鉴权生产方，不声称已验证其 checkpoint 身份；具体推理服务的原生 token 提取仍需适配，不能拿文本重分词或 usage 替代。
- trainingReady 为数据完整性检查结果，不替代训练方的奖励、策略版本和 on-policy 验证。阶段六继续真实端到端联调与一键运行流程。

## 2026-09-19 — 阶段四 / 0.4.0

### 修改范围

- 新增 `src/user-simulator/simulator.ts`：Profile + Query + 可见历史提示词、独立 OpenAI/Anthropic User API、完成状态和答案校验、响应大小与时限控制。
- 配置增加 `GATEWAY_USER_MODELS_JSON`；运行编排自动处理 waiting_user，公开 API 增加原 toolUseId 回答入口及能力声明。原仅登记模式保留。
- 后端 harness 增加用户可见历史投影、问题队列、maxUserQuestions 强制执行、答案内容去重和服务凭据保护的回填端点，复用现有 ConversationService 工具响应能力。
- 并发重复请求共享生成及回填；确认丢失时仅重试原答案一次。取消/清理/超时中止模拟推理，截断或格式错误不生成替代答案。
- 代理模式追加 `user.answer` 诊断事件，写入失败阻止回填；User 模型调用不进入主 Agent 模型轨迹或 maxModelCalls 计数。
- 修复没有 pendingQuestion 且普通 tool_result 缺少 toolUseId 时，undefined 比较误匹配待回答工具的问题。
- 新增 PHASE4 使用说明，更新 README、API、架构和服务版本。

### 验证记录

- `node --test Gateway/tests/*.test.ts`：39 项测试通过，包含前三阶段 26 项回归和阶段四 13 项测试。
- 新增测试覆盖连续两轮问答、双协议 API、Profile/Query 与可见历史、隐藏内容隔离、外部终端鉴权/校验/归属、并发去重、确认丢失重试、问答限额、错误回答、取消、超时、问题队列与采集故障。
- HTTP 闭环使用真实 Gateway、HTTP adapter、后端 HarnessCore 和本地模型替身；测试未启动真实 NestJS/SDK/数据库，也未调用真实模型。
- 当前环境仍缺少完整后端依赖、Bun 和 TypeScript 编译器，静态类型检查及真实环境端到端联调未完成。

### 当前限制与交接

- User 模型仅支持非流式严格 JSON 答案；模型 API 错误不自动重采样。
- 问答状态、生成去重及回填确认均为进程内存语义，不支持重启恢复或多副本协调。
- maxUserQuestions 按不同 toolUseId 计数，一个工具调用内的多题算一次。
- `user.answer` 是递交前记录，后续 `tool.result` 才反映工具执行；正式训练事件封存、token IDs/logprobs/masks 和可靠导出仍由阶段五实现。

## 2026-09-19 — 阶段三 / 0.3.0

### 修改范围

- Gateway 新增 session 专属 OpenAI / Anthropic 模型代理、主 Agent 身份校验、原子模型调用限额和 JSONL 诊断轨迹存储；上游密钥只保留在 Gateway。
- 新增双协议 JSON / SSE 解析，保留实际请求、原始响应、usage、工具调用与工具结果；子 Agent 和辅助调用继续转发但不记录内容。
- 后端新增 `services/api/trainingTransport.ts`，在协议转换后的 fetch 边界附加身份；训练客户端不复用会话缓存，显式子 Agent 身份优先。
- harness 准备请求传递私有 session 路由；AgentService 从根 SDK 消息上报最终工具结果，支持重复提交确认和冲突检查。
- Conversation Memory 的目录、召回、索引、证据补充、停止提醒、压缩及提交入口按训练会话短路；保留 Profile、Auto Memory 和普通用户原有行为。
- 新增受保护的诊断轨迹读取接口；采集 append 成功后才释放流结束标记或完整非流式响应，采集失败不允许伪成功。
- 更新 README、API、架构及阶段二交接说明，新增 PHASE3 配置和验证说明。

### 验证记录

- `node --test Gateway/tests/*.test.ts`：26 项测试通过，包含阶段一/二回归。
- 新增 11 项代理测试，覆盖双协议流式增量、主/子/辅助身份、工具结果幂等与冲突、并发限额、凭据隔离、截断流、采集故障和真实 Gateway HTTP 路由闭环。
- 新增 1 项 Memory 策略测试，直接加载后端 runtime/index/storage 函数，验证禁用路径不访问索引存储、不生成相关提醒，并保留普通会话行为。SQLite/YAML 使用访问即报错的替身；测试加载器用 Node 内置转换处理旧 TypeScript 语法。
- HTTP 闭环的 harness 和上游模型是本地替身；没有调用真实模型或写入实际用户数据库。
- 本环境缺少完整后端依赖、Bun 和 TypeScript 编译器，未完成真实 NestJS / SDK / 数据库联调或静态类型检查。

### 当前限制与交接

- JSONL 为 `diagnostic.v1`，读取接口返回 `trainingReady=false`；token IDs、logprobs、masks、封存和训练导出仍属于后续阶段。
- 文件 append 确认不提供 fsync、崩溃恢复或跨进程事务保证；运行状态仍在内存中。
- 未配置 Gateway 模型代理时保留阶段二直连模式，不产生模型轨迹。
- 阶段四继续实现 Ask_User_Question 的 API User 模拟终端、Profile + Query 提示词及问题次数限制。

## 2026-09-19 — 阶段二 / 0.2.0

### 修改范围

- Gateway 新增 `src/harness/client.ts`、`runner.ts`：服务 token HTTP 适配、准备/启动/轮询、取消与清理；扩展配置、运行记录和 API。
- 后端新增 `Network/modules/training-harness/`：受独立凭据保护的入口、可独立测试的生命周期核心；AppModule 注册模块，ConversationModule 导出已有服务。
- 复用 Profile/Settings/Conversation 服务；新建无登录凭据的训练用户，预置 workspace 文件，保存初始文件哈希，初始化失败回滚。
- UserService 新增仅内部调用的 trainingRunId 归属校验与严格清理分支，补齐训练用户相关记录清理，不发送真实账号禁用通知；普通用户删除保持原分支。
- SessionContext / AgentService / conversationMemoryRuntime 增加会话级训练及 Memory 禁用标志；训练流式路径不再修改模型全局环境变量，model.ts 的辅助模型选择读取训练会话。
- Network/main.ts 为训练入口单独配置 JSON parser；训练运行数据仍不新增数据库表或迁移。
- queryEngineFactory 为训练工具回答等待接入 AbortSignal；AgentService 在训练推理失败时返回错误，禁止普通产品的 stub fallback 被计作成功训练样本。核心也检查 fallback 标记。
- 示例 Profile 改为后端支持字段；README/API/架构文档更新，新增 PHASE2 运行说明。

### 验证记录

- `node --test Gateway/tests/*.test.ts`：14 项测试通过（新增 7 项）。
- Gateway 启动入口 `node --check Gateway/src/server.ts` 通过；已检查现有文件 diff 和新增文件空白。
- 覆盖同 task 多次采样用户/Profile/模型/workspace 隔离、初始文件字节数/SHA-256、后端幂等准备与冲突、准备取消竞争、失败回滚与清理重试、Ask_User_Question 等待与超时、无成功终态流处理。
- HTTP 闭环使用真实 Gateway、HTTP harness adapter、后端纯核心与临时文件系统；数据库、Profile 服务及 Agent 推理使用测试替身。没有调用真实模型，没有向实际用户数据库写入测试任务。
- 本环境仍无 Bun、后端 node_modules 或 TypeScript 编译器，因此尚未启动真实 NestJS 后端或完成静态类型检查。这些结果不等同于真实后端联调通过。

### 当前限制与交接

- 模型端点目前直连服务端模型配置；Gateway session 专属模型入口及主 Agent 轨迹采集在阶段三实现。
- 已禁用训练回合 Conversation Memory 准备流程，但完整提示词/工具描述/维护链路审计仍待阶段三验证。
- maxModelCalls 和 maxUserQuestions 尚未强制执行；User 模拟器将在阶段四实现，当前等待问题会保持 waiting_user 直到工具回答、取消或超时。
- 双端均使用有界内存状态；不支持重启恢复或多副本任务协调。已完成/失败的用户资源由显式 DELETE 回收。
- 真实环境后续验证：配置两个不同 modelProfile 的并发任务，确认真实 Profile、目录及会话绑定；再验证实际 Agent 取消、工具等待和清理。

## 2026-09-18 — 阶段一 / 0.1.0

### 范围

新增仓库根目录 `Gateway/`。没有修改现有后端、前端、数据库或根目录启动脚本。
未启动后端、未调用外部模型、未创建真实用户/会话/workspace。

### 修改

- 新增 Node 24 原生 TypeScript HTTP 服务，零运行时第三方依赖。
- 定义版本化运行、Agent 身份、轨迹事件、模拟用户、token 数据接口。
- 提供健康、能力查询、创建/读取运行及幂等取消 API。
- 增加内存容量/请求体上限、JSON 校验、便携文件路径校验、服务 token 鉴权。
- 固定训练策略声明，并显式返回 harness 尚未实现；避免登记成功被误认为训练已启动。
- 提供独立启动/测试命令、中文任务示例、API 文档及后续接入设计。

### 关键决策

- `runId` 即 rolloutId；同一 taskId 可有多个采样实例。
- 阶段一使用有界内存存储；持久化、事件 API 和幂等创建后续实现。
- 模型仅登记服务端配置名称，任务中不存 API 凭据。
- 暂未实现的模块以文档约定，不放入返回伪成功的空实现。

### 验证

- `node --test Gateway/tests/*.test.ts`：7 项测试通过（Node v24.19.0）。测试启动真实本地 HTTP 服务，覆盖创建/读取/取消闭环、多采样隔离、能力声明、鉴权、非法 JSON、413/415、路径穿越与冲突、存储复制、容量及配置边界。
- 静态类型检查尚未运行：本机当前没有可用的 TypeScript 编译器，后端依赖也未安装。已提供独立 `tsconfig.json` 和 `typecheck` 脚本；运行时测试不能代替静态类型检查。
- 真实后端、模型 API、训练轨迹和 User 模拟器未做联调，属于后续阶段。
- Git 检查通过命令级 `safe.directory` 参数读取，不修改全局 Git 配置；此次变更仅为新增 `Gateway/`。

### 阶段二入口

下一步实现 harness adapter 和受服务凭据保护的后端训练入口：把当前 `harness=null` 替换为真实绑定，并补充准备失败回滚、初始文件哈希、运行状态管理和并发隔离测试。
