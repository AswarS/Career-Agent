# 前端 API 联调冲突与待实现清单

更新时间：2026-04-15

## 1. 审查范围

- API 合同：`docs/zh/recommended-api-contract.md`
- 实现文档：`docs/frontend-implementation-plan.md`、`docs/career-agent-spec.md`
- 现有实现：`src/services/*`、`src/stores/workspace.ts`、`src/pages/ConversationWorkspacePage.vue`、`src/modules/artifacts/ArtifactHost.vue`

说明：本清单只基于 `docs/zh/recommended-api-contract.md` 进行 API 合同审查。

## 2. 结论摘要

1. v1 核心 8 个接口（线程读取、画像读取/更新、工件读取/刷新）已在前端客户端层落地。
2. 扩展接口（会话写入、多模态上传、工作画布交互回传）尚未接入前端实现。
3. 存在可执行层面的合同差异，主要集中在请求上下文头、错误模型透传和时间格式一致性。

## 3. 已对齐项

1. 路由与基础路径对齐：`/api/career-agent/*` 已在 `src/services/careerAgentApiRoutes.ts` 定义。
2. 客户端接口对齐：`src/services/careerAgentClient.ts` 已覆盖 v1 核心 8 接口。
3. 字段兼容与归一化对齐：
   - snake_case/camelCase 兼容
   - `open-artifact`/`open_artifact` 兼容
   - `media` 与 `attachments` 合并
   - `queued`/`failed` 映射到 `loading`/`error`
   已在 `src/services/upstreamContracts.ts` 实现。
4. URL 安全边界对齐：`src/modules/artifacts/urlCanvasPolicy.ts` 已限制为相对路径或受信任 `http/https`。

## 4. 冲突项（合同 vs 当前代码）

### C-01 请求上下文头未落地

- 合同要求：upstream 业务请求应携带 `x-user-id`；写请求建议携带 `x-request-id`。
- 当前实现：`src/services/upstreamCareerAgentClient.ts` 的 `mergeHeaders` 仅拼接 `Accept` 和 `Content-Type`，未注入上述头。
- 影响：联调阶段难以做用户隔离、请求追踪与问题排查。

### C-02 统一错误对象未透传

- 合同要求：错误响应返回 `{ code, message, request_id }`。
- 当前实现：`parseJsonResponse` 仅按状态码抛出通用错误文本，未解析业务错误对象。
- 影响：前端无法基于错误码做精细化提示、重试策略或埋点。

### C-03 时间格式一致性不足

- 合同要求：统一 ISO 8601 UTC。
- 当前实现：`src/stores/workspace.ts` 中 `submitDraftMessage` 使用本地格式 `YYYY-MM-DD HH:mm` 生成时间。
- 影响：后续若本地草稿消息与上游消息合并持久化，时间排序和展示规则可能出现不一致。

## 5. 前端未实现项

## 5.1 P0（优先联调闭环）

1. 会话发送链路
- 目标：接入 `POST /api/career-agent/threads/:threadId/messages`。
- 当前证据：`ConversationWorkspacePage` 调用的是 `workspaceStore.submitDraftMessage` 本地草稿；`ConversationComposer` 也明确为 mock 驱动。
- 缺口：未实现 send/pending/error/retry 的真实请求状态机。

2. 会话新建与删除
- 目标：接入 `POST /api/career-agent/threads`、`DELETE /api/career-agent/threads/:threadId`。
- 当前证据：`CareerAgentClient` 与路由常量未定义对应方法与路径。
- 缺口：左侧会话列表仅支持读取与切换，缺少真实生命周期操作。

3. 请求头与错误模型接线
- 目标：将 `x-user-id`、`x-request-id` 与统一错误对象接入 `upstreamCareerAgentClient`。
- 当前证据：见 C-01/C-02。

## 5.2 P1（扩展能力）

1. 多模态上传三段式
- 目标：`presign -> PUT 二进制 -> complete`，并在发送消息时引用 `attachment_asset_ids`。
- 当前证据：`ConversationComposer` 的图片/语音按钮为 disabled；客户端接口无上传方法。

2. 工作画布交互回传
- 目标：接入 `POST /api/career-agent/artifacts/:artifactId/interactions`。
- 当前证据：`ArtifactHost` 仅负责渲染 iframe 与刷新，无交互事件上送链路。

3. 工件传输通道
- 目标：基于配置支持 polling/SSE/WebSocket 中至少一种真实上游机制。
- 当前证据：`runtime.ts` 有配置枚举，`artifactRefreshPolicy.ts` 仅在 mock 模式模拟生命周期。

## 5.3 P2（体验完善）

1. `markdown` / `cards` 工件渲染
- 当前证据：`ArtifactHost` 对非 `html/url` 显示“留待后续阶段实现”。

2. 会话持久化行为
- 当前证据：实现计划文档将 persistent session behavior 标记为 future slice；当前 store 未提供持久化策略。

## 6. 建议实施顺序（面向前端）

1. 先完成 P0
- 扩展 `CareerAgentClient` 与 `careerAgentApiRoutes`
- 在 `upstreamCareerAgentClient` 接入请求头、错误对象解析
- 将 `submitDraftMessage` 替换为真实发送状态机（含失败恢复）

2. 再推进 P1
- 上传链路与消息发送串联
- 定义 iframe 到 host 的交互事件协议并接入 interactions API
- 根据后端能力选择 SSE 或 WebSocket（或继续 polling）

3. 最后做 P2
- 完成 markdown/cards 渲染
- 引入线程级本地持久化或上游会话恢复策略

## 7. 验收标准（建议）

1. 能在真实 upstream 模式下完成“发送消息 -> 看到 pending -> 收到状态更新/失败重试”的闭环。
2. 会话可新建、删除，并与左侧导航状态一致。
3. 上传图片后可通过 `attachment_asset_ids` 与消息发送关联。
4. 工作画布交互可回传到上游并触发可见更新。
5. 错误展示可区分 `code`，并可看到 `request_id` 用于排障。
