# 前端 API 联调冲突与待实现清单

更新时间：2026-04-23

## 1. 审查范围

- API 合同：`docs/zh/recommended-api-contract.md`
- 实现文档：`docs/frontend-implementation-plan.md`、`docs/career-agent-spec.md`
- 现有实现：`src/services/*`、`src/stores/workspace.ts`、`src/pages/ConversationWorkspacePage.vue`、`src/modules/artifacts/ArtifactHost.vue`

说明：本清单只基于 `docs/zh/recommended-api-contract.md` 进行 API 合同审查。

## 2. 结论摘要

1. 会话列表读取已按当前 server 形态调整为 `GET /api/career-agent/threads/:userId`，默认用户 id 为 `1`。
2. 前端 upstream client 已改为 `axios`，本地联调默认指向 `http://localhost:4000`。
3. 前端“新建对话”已改为先进入空白落地页；只有用户首次提交后，前端才调用 `POST /api/career-agent/threads` 创建真实线程。
4. 当前 server 的工件接口仍和接口图不完全一致：`GET /api/career-agent/artifacts/:id` 实际按 `uid` 返回列表，前端已做兼容，但仍缺真正的单工件详情。
5. Composer 已支持图片和文件本地选择、本地预览和本地草稿消息；这不是端到端上传。
6. 扩展接口（真实消息发送、真实多模态上传、工作画布交互回传）尚未接入前端实现。

## 3. 已对齐项

1. 路由与基础路径对齐：`/api/career-agent/*` 已在 `src/services/careerAgentApiRoutes.ts` 定义。
2. 会话列表用户路径已对齐当前 server：`GET /api/career-agent/threads/:userId`。
2. 客户端接口对齐：`src/services/careerAgentClient.ts` 已覆盖 v1 核心读取接口，并新增 `createThread`。
3. 字段兼容与归一化对齐：
   - snake_case/camelCase 兼容
   - `open-artifact`/`open_artifact` 兼容
   - `media` 与 `attachments` 合并
   - `queued`/`failed` 映射到 `loading`/`error`
   已在 `src/services/upstreamContracts.ts` 实现。
4. URL 安全边界对齐：`src/modules/artifacts/urlCanvasPolicy.ts` 已限制为相对路径或受信任 `http/https`。

## 4. 冲突项（合同 vs 当前代码）

### C-01 错误模型未透传

- 合同要求：错误响应返回 `{ code, message, request_id }`。
- 当前实现：`parseJsonResponse` 仅按状态码抛出通用错误文本，未解析业务错误对象。
- 影响：前端无法基于错误码做精细化提示、重试策略或埋点。

### C-02 时间格式一致性不足

- 合同要求：统一 ISO 8601 UTC。
- 当前实现：`src/stores/workspace.ts` 中本地草稿消息仍使用本地格式 `YYYY-MM-DD HH:mm` 生成时间。
- 影响：后续若本地草稿消息与上游消息合并持久化，时间排序和展示规则可能出现不一致。

### C-03 当前 server 仍缺少真实上传与真实发送接口

- 当前证据：`/Users/fancy/code/Career-Agent/server` 里没有 upload controller；`SendMessageDto` 存在，但 `ConversationController` 尚未暴露 `POST /api/career-agent/threads/:threadId/messages`。
- 当前前端：只做本地附件选择、本地 object URL 预览和本地草稿消息。
- 影响：暂时无法做真实上传、服务端资产引用和真实 agent 消息发送闭环。

### C-03A 新对话语义已前移到前端

- 当前产品语义：空白会话不应在用户进入页面或点击“新建对话”时就落库。
- 当前前端实现：默认首页和“新建对话”按钮都会进入空白落地页；首次提交时前端先创建线程，再把本地首条消息回放到新线程界面。
- 当前缺口：由于上游没有真实消息发送接口，首条消息仍是本地前端占位消息，而不是服务端持久化结果。
- 后续建议：后端补 `POST /api/career-agent/threads/:threadId/messages` 或等价 `POST /api/career-agent/chat` 后，前端可直接把“创建线程 + 首条消息发送”收敛为一次真实请求链路。

### C-04 当前 server 工件接口语义不一致

- 接口图：`GET /api/career-agent/artifacts` 是工件目录，`GET /api/career-agent/artifacts/:artifactId` 是单工件详情。
- 当前 server：`ArtifactController.getById(@Param('id') uid)` 调用 `listArtifacts(uid)`，也就是 `:id` 实际是用户 id。
- 当前前端：`listArtifacts()` 请求当前 server 真实路径 `/api/career-agent/artifacts/:userId`；`getArtifact()` 能兼容数组响应并按 artifact id 本地筛选。
- 影响：后端需要补真正的单工件详情和刷新接口，前端才能做严格的详情读取和刷新闭环。

### C-05 新建会话可能受后端时间字段默认值影响

- 当前 server entity 中 `createdAt` / `updatedAt` 是非空字段。
- 当前 DTO 只有 `updatedAt` 字段，且 `ValidationPipe({ whitelist: true })` 会丢弃 DTO 未声明字段。
- 前端会提交 `userId`、`title`、`preview`、`updatedAt`，但 `createdAt` 是否能落库取决于后端是否补默认值。
- 影响：如果 `POST /api/career-agent/threads` 返回 500，需要后端为 `createdAt` 增加默认值或在 service 创建时填充。

## 5. 前端未实现项

## 5.1 P0（优先联调闭环）

1. 会话发送链路
- 目标：接入 `POST /api/career-agent/threads/:threadId/messages`。
- 当前证据：`ConversationWorkspacePage` 与 `ConversationLandingPage` 最终都走到 `workspaceStore.submitDraftMessage` 本地草稿；server 当前 controller 尚未暴露真实发送 endpoint。
- 缺口：未实现 send/pending/error/retry 的真实请求状态机。

2. 会话新建与删除
- 目标：接入 `POST /api/career-agent/threads`、`DELETE /api/career-agent/threads/:threadId`。
- 当前状态：`POST /api/career-agent/threads` 已接入；删除尚未接入。
- 缺口：后端需确认创建会话的时间字段默认值；删除接口尚未定义。

3. 错误模型接线
- 目标：将统一错误对象接入 `upstreamCareerAgentClient`。
- 当前证据：见 C-01。

## 5.2 P1（扩展能力）

1. 多模态上传三段式
- 目标：`presign -> PUT 二进制 -> complete`，并在发送消息时引用 `attachment_asset_ids`。
- 当前证据：`ConversationComposer` 已支持图片和文件本地附件，但客户端接口无真实上传方法，当前 server 也没有 upload controller。
- 当前边界：本地附件只用于 UI 验证和消息渲染验证，不代表真实上传已接通。

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
- 在 `upstreamCareerAgentClient` 接入错误对象解析
- 将 `submitDraftMessage` 替换为真实发送状态机（含失败恢复）

2. 再推进 P1
- 在后端 upload controller 稳定后，将当前本地附件 UI 串联真实上传链路与消息发送
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
