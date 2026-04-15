# 会话与工作台 API 差异与选型说明

## 1. 文档目的

这份文档用于给协作者快速对齐：

1. 当前前端仓库真实使用的 API 契约是什么
2. [../../api.md](../../api.md) 中现有提案与真实契约差异在哪里
3. 应该优先采用哪种方案，为什么
4. 采用不同方案的大致工作量差距

说明：本次仅做文档对齐，不修改协作者原始文件 [../../api.md](../../api.md)。

## 2. 结论（先看这一段）

推荐采用当前前端已落地的分域 API 方案（/api/career-agent/*）作为联调主合同。

- 将 [../../api.md](../../api.md#L1) 前 36 行保留为业务需求意图（要支持初始化、历史、更新、新增、删除）
- 不直接采用 [../../api.md](../../api.md#L37) 后半段的具体路径与数据结构
- 由这份差异说明和推荐 API 文档统一对齐前后端合同

核心原因：当前前端代码、状态流和测试均围绕线程/消息/画像/工件分域模型实现，若改回 conversations 五接口模型，会引入明显返工。

## 3. 对比依据

本说明基于以下仓库事实：

- 路由与路径常量: [../../src/services/careerAgentApiRoutes.ts](../../src/services/careerAgentApiRoutes.ts#L1)
- 前端客户端接口: [../../src/services/careerAgentClient.ts](../../src/services/careerAgentClient.ts#L1)
- 上游字段兼容与归一化: [../../src/services/upstreamContracts.ts](../../src/services/upstreamContracts.ts#L1)
- 会话页发送现状（本地草稿，未接后端发送链路）: [../../src/pages/ConversationWorkspacePage.vue](../../src/pages/ConversationWorkspacePage.vue#L26), [../../src/stores/workspace.ts](../../src/stores/workspace.ts#L344)
- 产品规格中的核心对象约束: [../career-agent-spec.md](../career-agent-spec.md#L367)
- 团队同步文档中的当前 API 路径: [team-sync.md](team-sync.md#L198)

## 4. 主要差异一览

| 主题 | api.md 当前提案 | 当前前端真实契约 | 风险 | 建议 |
|---|---|---|---|---|
| API 根路径 | /api/conversations/* | /api/career-agent/* | 路径不一致导致无法联调 | 统一到 /api/career-agent/* |
| 领域模型 | ConversationRecord（user + agent[]） | thread / message / profile / artifact | UI 状态与数据结构错位 | 采用分域模型 |
| 成功返回包裹 | code + message + data | 直接返回业务对象或数组 | 当前客户端不会自动解 data | v1 先直返业务体；错误走 HTTP 状态码 |
| 字段命名 | conversation_id 等单一命名 | 兼容 snake_case 与 camelCase | 命名不统一易出兼容问题 | 对外主推 snake_case，过渡期兼容 camelCase |
| 消息动作 | 未定义结构化 action | 支持 open-artifact 动作 | 画布打开链路会丢失 | 保留消息动作合同 |
| 多模态承载 | 消息里含 image/video/audio/html/app | 消息媒体仅 image/video；html/url 走 artifact | 安全边界和渲染职责混淆 | 按 message media 与 artifact 分层 |
| 会话写操作 | update/create/delete 已定义 | 当前前端暂未接入真实发送/新建/删除链路 | 先上会导致前后端并发改动 | 作为下一阶段扩展，不放入 v1 联调最低集 |
| 工件生命周期 | 未体现 revision 与 refresh | 已有 artifacts + artifact/:id + refresh | 右侧工件面板无法对齐 | 保留工件刷新接口 |

## 5. 为什么优先分域模型

1. 与当前页面和 store 一致，改动最小

- 初始化依赖并行加载 threads/profile/suggestions/artifacts: [../../src/stores/workspace.ts](../../src/stores/workspace.ts#L141)
- 会话消息独立加载: [../../src/stores/workspace.ts](../../src/stores/workspace.ts#L198)
- 工件刷新独立请求: [../../src/stores/workspace.ts](../../src/stores/workspace.ts#L294)

2. 与产品规格一致

- 核心集成对象明确是 thread/message/profile/artifact/attachment: [../career-agent-spec.md](../career-agent-spec.md#L367)

3. 与技能流程偏好一致（先合同再 UI）

- 交付顺序要求先定义数据合同与请求层，再接页面状态: [../../.agents/skills/vue-agent-delivery/SKILL.md](../../.agents/skills/vue-agent-delivery/SKILL.md#L35)

## 6. 选型建议（给协作者）

建议协作者采用以下口径：

1. 业务目标保持不变

- 仍然要覆盖会话列表、历史、更新、新增、删除这些业务能力

2. 技术合同分阶段

- 第一阶段（联调最低集）采用当前 8 个分域接口
- 第二阶段再补会话写操作（发送、新建、删除）

3. 文档组织方式

- 差异文档说明“为什么不直接用 conversations 五接口”
- 推荐 API 文档作为真正联调合同

## 7. 工作量对比（审慎估算）

以下为相对工作量，用于决策，不是排期承诺。默认前提：现有前端结构不大改。

| 方案 | 前端改动量 | 后端改动量 | 联调风险 | 结论 |
|---|---|---|---|---|
| A. 采用当前分域 API（推荐） | 低：主要是环境切换、联调、修边角 | 中：实现 8 个接口与字段对齐 | 低到中 | 推荐 |
| B. 强行改成 conversations 五接口 | 高：service/store/页面状态与测试需要重构 | 中：可按文档实现，但与前端现状不匹配 | 高 | 不推荐 |
| C. 两套接口并存 | 中到高：前端与后端都要维护双合同 | 高：长期维护成本最大 | 高 | 不推荐 |

可执行建议：先做 A，让页面跑通；B 中的写操作能力以“二阶段扩展”方式补齐。

## 8. 给协作者可直接复用的一段话

当前仓库前端已稳定在 thread/message/profile/artifact 分域合同，且工件面板、消息动作、画像编辑链路都依赖这套结构。为减少返工，建议先按 /api/career-agent/* 的 8 个接口完成联调最低集；会话发送、新建、删除作为第二阶段扩展补入。api.md 前半部分业务目标保留，后半部分接口细节建议以推荐 API 文档为准。