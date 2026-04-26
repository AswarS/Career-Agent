# 前端 API 联调冲突与待实现清单

更新时间：2026-04-26

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
5. Composer 已支持图片和文件本地选择；mock 模式模拟上传，upstream 模式按后端当前合同执行文件直传。
6. 真实消息发送和后端直传上传已接入；工作画布交互回传仍未接入。

## 3. 已对齐项

1. 路由与基础路径对齐：`/api/career-agent/*` 已在 `src/services/careerAgentApiRoutes.ts` 定义。
2. 会话列表用户路径已对齐当前 server：`GET /api/career-agent/threads/:userId`。
2. 客户端接口对齐：`src/services/careerAgentClient.ts` 已覆盖 v1 核心读取接口，并新增 `createThread`、`uploadThreadFile`、`sendMessage`。
3. 字段兼容与归一化对齐：
   - snake_case/camelCase 兼容
   - `open-artifact`/`open_artifact` 兼容
   - `media` 与 `attachments` 合并
   - 后端 `file` 附件归一化为前端 `files`
   - `queued`/`failed` 映射到 `loading`/`error`
   已在 `src/services/upstreamContracts.ts` 实现。
4. URL 安全边界对齐：`src/modules/artifacts/urlCanvasPolicy.ts` 已限制为相对路径或受信任 `http/https`。
5. 会话发送链路已接入：`workspaceStore.submitDraftMessage` 会先上传附件，再调用 `POST /threads/:threadId/messages`，成功后重新拉取服务端消息历史。
6. 错误模型已部分接线：`upstreamCareerAgentClient` 会透出后端统一错误对象中的 `code` 与 `request_id`；同时兼容 Nest 默认异常。

## 4. 冲突项（合同 vs 当前代码）

### C-01 错误模型仍需后端统一

- 合同要求：错误响应返回 `{ code, message, request_id }`。
- 当前前端：已解析并展示 `code`、`message`、`request_id`；若后端返回 Nest 默认异常，则降级展示 HTTP 状态和 message。
- 剩余影响：前端还没有基于具体错误码做精细化提示、重试策略或埋点。

### C-02 时间格式一致性不足

- 合同要求：统一 ISO 8601 UTC。
- 当前实现：本地 pending / error 状态消息已统一使用 `Date.toISOString()`。
- 剩余影响：mock fixture 中仍存在历史展示用本地时间字符串，但不会进入 upstream 发送链路。

### C-03 后端直传方案已接入，三段式上传仍未启用

- 当前前端：已接入 `POST /api/career-agent/threads/:threadId/files` 和 `POST /api/career-agent/threads/:threadId/messages`。
- 当前行为：发送时先直传附件，拿到 `asset_id` 后通过 `attachment_asset_ids` 引用；发送成功后重新拉取服务端消息历史。
- 剩余影响：生产对象存储的 `presign -> PUT -> complete` 三段式上传仍未启用。

### C-03A 新对话语义已前移到前端

- 当前产品语义：空白会话不应在用户进入页面或点击“新建对话”时就落库。
- 当前前端实现：默认首页和“新建对话”按钮都会进入空白落地页；首次提交时前端先创建线程，再立即执行真实发送链路。
- 当前状态：首条消息发送成功后以服务端消息历史为权威来源。

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
- 当前状态：已接入，包含 pending、本地附件预览、上传/发送/刷新阶段错误提示，以及发送后刷新服务端历史。
- 剩余缺口：尚未提供显式重试按钮。

2. 会话新建与删除
- 目标：接入 `POST /api/career-agent/threads`、`DELETE /api/career-agent/threads/:threadId`。
- 当前状态：`POST /api/career-agent/threads` 已接入；删除尚未接入。
- 缺口：后端需确认创建会话的时间字段默认值；删除接口尚未定义。

3. 错误模型接线
- 目标：将统一错误对象接入 `upstreamCareerAgentClient`。
- 当前状态：已接入基础解析与展示；精细化错误码 UI 仍待后续。

## 5.2 P1（扩展能力）

1. 多模态上传三段式
- 目标：生产对象存储模式下支持 `presign -> PUT 二进制 -> complete`，并在发送消息时引用 `attachment_asset_ids`。
- 当前状态：后端当前直传接口已接入，三段式上传未启用。
- 当前边界：直传路径适合当前本地/联调后端；大文件、对象存储和安全扫描仍需要后端继续定义。

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

1. P0 已完成主体联调闭环
- `CareerAgentClient` 与 `careerAgentApiRoutes` 已扩展
- `upstreamCareerAgentClient` 已接入错误对象解析
- `submitDraftMessage` 已替换为真实发送状态机
- 后续可补显式重试按钮和更细粒度错误码 UI

2. 再推进 P1
- 评估是否从当前后端直传方案演进到对象存储三段式上传
- 定义 iframe 到 host 的交互事件协议并接入 interactions API
- 根据后端能力选择 SSE 或 WebSocket（或继续 polling）

3. 最后做 P2
- 完成 markdown/cards 渲染
- 引入线程级本地持久化或上游会话恢复策略

## 7. 验收标准（建议）

1. 能在真实 upstream 模式下完成“发送消息 -> 看到 pending -> 上传附件 -> 服务端接受 -> 刷新历史”的闭环。
2. 会话可新建、删除，并与左侧导航状态一致。
3. 上传图片后可通过 `attachment_asset_ids` 与消息发送关联。
4. 工作画布交互可回传到上游并触发可见更新。
5. 错误展示可区分 `code`，并可看到 `request_id` 用于排障。
