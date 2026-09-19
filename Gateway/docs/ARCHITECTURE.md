# Gateway 架构与后续接入

## 职责

Gateway 独立启动和测试，不导入后端 NestJS 模块、数据库实体或前端组件。
后端仍是执行 harness；Gateway 负责训练生命周期与交互采集。

```text
训练调用方 → Gateway → harness adapter → Career-Agent 后端
                       ↑                       ↓
                 主 Agent 轨迹 ← model proxy ← 模型调用
                       ↓
                训练推理服务/外部 API

后端 Ask_User_Question → Gateway User Simulator → 模拟用户 API
                      ← 回填原 toolUseId 的答案 ←
```

阶段三已接入 session 模型代理、主 Agent 内容采集和内部工具结果上报；阶段四已连接独立 User 模型 API、问题队列及原工具回填；阶段五新增持久事件日志、游标/SSE、封存清单和受信推理生产方 token 接入/导出。

## 身份与生命周期

`taskId → runId(rolloutId) → gatewaySessionId + harness binding`。
同一 task 的每次采样分配独立 run；harness binding 在阶段二初始化成功后才包含真实 userId、conversationId、workspaceRoot。
不使用伪造用户 ID 或虚构 workspace 路径表达已初始化。

规划状态：created → preparing → running ↔ waiting_user → completed/failed/timed_out/cancelled。
未配置 harness 时只允许 created → cancelled；已配置时进入完整执行状态管理。执行结束后未来另行封存轨迹。
执行状态仍为有界进程内 Map，不承诺执行恢复或多进程共享。轨迹单独持久化，支持封存归档重启读取；存储目录使用单写入进程，详见 PHASE5.md。

## 后端适配位置（已检查的现有代码）

以下路径以仓库根目录为基准；阶段二已接入 AgentService、ConversationService、ProfileService 和 SettingsService：

| 位置 | 后续用途 |
| --- | --- |
| `CrescoAI-Backend/backend/src/Network/modules/agent/agent.service.ts` | 会话配置、workspace、Conversation Memory 提示及执行事件 |
| `CrescoAI-Backend/backend/src/Network/memory/conversationMemoryConfig.ts` | 现有全局开关，扩展为会话策略 |
| `CrescoAI-Backend/backend/src/services/api/openAICompatibility.ts` | 模型兼容转发接入 |
| `CrescoAI-Backend/backend/src/services/api/gatewayTokenMonitor.ts` | 现有 usage 监控参考；不能代替完整轨迹 |
| `CrescoAI-Backend/backend/src/utils/agentContext.ts` | 异步 Agent 身份传递 |
| `CrescoAI-Backend/backend/src/tools/SkillTool/SkillTool.ts` | 子 Agent 标识与父子关系 |
| `CrescoAI-Backend/backend/src/Network/modules/conversation/conversation.controller.ts` | 已有工具回答回填接口 |

## 必须保持的训练语义

1. 每个 rollout 一个虚拟用户、一个会话和独立 workspace。初始文件在运行前写入并记录清单/哈希。
2. 仅关闭 Conversation Memory；保留当前会话历史、Profile 及其他后端能力。必须在实际模型输入构造前禁用相关注入，不能仅在导出时删文本。
3. 只采集主 Agent 策略调用。主 Agent 调用 SkillTool 的动作及其可见返回属于主轨迹；子 Agent 内部调用不进入训练轨迹。
4. 调用必须明确 role、purpose 及父子关系。未知身份不能默认归入 main。压缩/Profile 维护等调用即使没有 parentAgentId，也不是策略调用。
5. User 模拟器输入至少包含初始 Profile + Query、用户可见历史和当前问题，不能读取隐藏推理或评分答案。答案以原 toolUseId 回填，不创建替代用户消息。
6. 原始请求、流式完成状态与工具执行事件需关联；重试单独标记 attempt，避免重复生成和重复轨迹。
7. token 数据只能来自支持该能力的推理服务；不能从文本重新分词并声称是原始 rollout token/logprobs。工具结果及模拟用户答案不参与策略 loss。
8. 注册层路径验证不能取代阶段二的文件系统边界检查；逻辑用户隔离也不等于操作系统沙箱。

## 后续模块交付

| 阶段 | 目录 | 交付 |
| --- | --- | --- |
| 二 | `src/harness/` | 后端服务凭据、创建用户/会话、Profile 与文件初始化、执行管理 |
| 三 | `src/proxy/` | 模型代理、显式身份传递、主 Agent 过滤、Conversation Memory 实际禁用 |
| 四 | `src/user-simulator/` | 提示构建、模型 API、校验/回填、问答上限与去重 |
| 五 | `src/trajectories/`, `src/training/` | 可靠事件存储、收发/封存/导出、token 能力适配 |
| 六 | 测试、样例及文档 | 真实后端端到端验证与一键流程 |

参考 uni-agent 的 session 专属模型入口、Gateway/推理引擎职责分离、主生成与环境观察 mask。
本阶段不引入 uni-agent 依赖，不宣称其 Python API 或 TransferQueue 兼容。
参考：https://uni-agent.readthedocs.io/en/latest/concepts/gateway-and-trajectories.html
