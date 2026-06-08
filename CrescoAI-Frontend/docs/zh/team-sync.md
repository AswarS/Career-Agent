# Team Sync

## 作用

这个文档只记录两类事情：

- 需要你去确认或推动的跨团队事项
- 需要前端仓库与上游 `claude-code-rev` 仓库对齐的集成事项

它不是产品 spec，也不是设计文档。

## 当前边界

更新时间：2026-05-28

- 前端仓库负责前端壳体、页面状态、API client / adapter、mock contract 和浏览器安全宿主。
- 后端、agent、artifact 生成和外部应用生命周期属于同级只读仓库 `/Users/fancy/code/Career-Agent` 的职责范围。
- `artifact host` / `artifact pane` 在产品上按工作画布理解，支持普通侧栏、聚焦、沉浸三种展示模式。
- 前端已经具备登录注册、路由守卫、会话列表/创建、消息发送、文件直传、消息媒体展示、工件打开/刷新入口、profile 页面和 settings 页面。

## 当前仍需同步的事项

### 0. 登录注册、鉴权与会话删除

更新时间：2026-05-28

已对齐并可联调：

- 注册：`POST /api/career-agent/auth/register`
- 登录：`POST /api/career-agent/auth/login`
- 刷新 token：`POST /api/career-agent/auth/refresh`
- 当前 session：`GET /api/career-agent/auth/session`
- 退出：`POST /api/career-agent/auth/logout`
- 全局 Bearer guard：`/api/career-agent/**` 非 public 路由需要 `Authorization: Bearer <token>`
- 前端 upstream 模式保存 `access_token` / `refresh_token` 到本地 session，启动时先校验 session，失败后尝试 refresh。

仍需后端确认或补齐：

- 删除会话：当前 `backend/src/Network/modules/conversation/conversation.controller.ts` 仍未看到 `DELETE /api/career-agent/threads/:threadId`。
- 未授权响应：确认所有受保护接口统一返回 `401`，响应体至少包含稳定 `code` 和 `message`，便于前端统一提示/清 session。
- 过期态语义：确认 access token 过期后是否一律由 `POST /api/career-agent/auth/refresh` 换新 session，refresh token 过期时是否返回 `401`。
- Cookie 模式：如果后端后续改成 HttpOnly Cookie，需要重新确认 `VITE_CAREER_AGENT_WITH_CREDENTIALS`、CSRF 策略和前端 token 存储策略。
- 前端当前对 `DELETE /threads/:threadId` 的 404/405/501 做可选能力兼容；后端实现后应移除这个降级假设。

### 1. API 路径和上游 contract

更新时间：2026-05-28

当前后端只读核查结果：

- 已有 `POST /api/career-agent/threads`
- 已有 `GET /api/career-agent/threads/:id`，其中 `:id` 仍是用户 id。
- 已有 `GET /api/career-agent/threads/:id/messages`，其中 `:id` 是会话 id。
- 已有 `POST /api/career-agent/threads/:id/messages`
- 已有 `POST /api/career-agent/threads/:id/files`
- 已有 `GET /api/career-agent/threads/:id/files/:fileName`
- 已有 `GET /api/career-agent/settings`
- 已有 `PATCH /api/career-agent/settings/username`
- 已有 `GET /api/career-agent/settings/api`
- 已有 `PUT /api/career-agent/settings/api`
- 已有 `POST /api/career-agent/settings/api`
- 已有 `POST /api/career-agent/settings/api/test`

仍需对齐或补齐：

- Profile：前端当前调用 `GET /api/career-agent/profile`、`PUT /api/career-agent/profile`、`GET /api/career-agent/profile/suggestions`；后端当前未看到对应 controller。
- Artifact 列表和详情：前端当前调用 `GET /api/career-agent/artifacts` 和 `GET /api/career-agent/artifacts/:artifactId`；后端当前只看到 `GET /api/career-agent/artifacts/:id`，并且 service 按 `uid` 返回列表，不是真正单工件详情。
- Artifact 刷新：前端保留 `POST /api/career-agent/artifacts/:artifactId/refresh` 入口；后端当前未看到对应路由。
- Artifact payload：需要稳定字段 `id`、`type`、`title`、`status`、`render_mode`、`revision`、`payload`、`updated_at`。
- 会话列表路径：如果后端长期保持 `GET /threads/:userId`，前端可继续兼容；如果改成当前用户隐式路径，需要提前同步。
- 错误响应：所有 upstream 错误建议稳定包含 `code`、`message`，可选 `request_id`。

### 2. 环境变量

如果上游准备开始联调，需要先对齐这些环境变量：

- `VITE_CAREER_AGENT_CLIENT_MODE`
- `VITE_CAREER_AGENT_API_BASE_URL`
- `VITE_CAREER_AGENT_USER_ID`
- `VITE_CAREER_AGENT_WITH_CREDENTIALS`
- `VITE_CAREER_AGENT_ARTIFACT_TRANSPORT`
- `VITE_CAREER_AGENT_ENABLE_VOICE_INPUT`
- `VITE_CAREER_AGENT_TRUSTED_CANVAS_ORIGINS`
- `VITE_CAREER_AGENT_NODE_CANVAS_FIXTURE_URL`
- `VITE_CAREER_AGENT_HTML_APP_EXAMPLE_URL`
- `VITE_CAREER_AGENT_NODE_APP_EXAMPLE_URL`

默认示例见：

- `.env.example`

### 3. 工作画布事件与实时更新

仍需和后端 / agent 团队确认：

- 右侧工作画布中的交互，是否作为结构化事件回传给 agent
- 这些事件是否同时绑定 `thread_id` 和 `artifact_id`
- agent 更新后，是回传新消息、更新 artifact revision，还是两者都回传
- artifact 更新推送方式是 polling、SSE、WebSocket，还是其他事件通道。

前端当前状态：

- `VITE_CAREER_AGENT_ARTIFACT_TRANSPORT` 已支持 `polling`、`sse`、`websocket` 配置枚举；真实 upstream 默认仍按 `polling`。
- 模拟面试、代码题、可视化学习等工作画布都应该进入 agent 反馈回路
- 前端只发送结构化交互事件，不负责 agent 推理
- 前端需要一个稳定的 typed event contract，而不是读取任意 DOM 状态

建议事件字段：

- `thread_id`
- `artifact_id`
- `artifact_revision`
- `interaction_type`
- `action_id`
- `payload`
- `created_at`

### 4. 对话消息合同

已支持的对话动作：

- `kind: open-artifact`
- `label`
- `artifact_id` / `artifactId`
- `view_mode` / `viewMode`

默认含义：

- agent 返回的消息可以携带动作
- 前端只负责把动作渲染成按钮，并打开对应工作画布
- 前端不根据自然语言自行推理要打开哪个画布
- `viewMode` 可用于决定默认进入 `pane`、`focus` 或 `immersive`

已支持的消息扩展字段：

- `reasoning` 或兼容性 `think`
- `agent_id`
- `agent_name`
- `agent_accent`
- `media` / `attachments`
- 媒体字段支持 `image`、`video`、`url` / `src`、`title`、`caption`、`alt`、`mime_type` / `mimeType`、`poster_url` / `posterUrl`

仍需长期对齐：

- reasoning 长期应使用显式字段，不依赖 `<think>...</think>`。
- 多 agent 第一版只做名称和颜色区分；如要复杂编排 UI，需要新增产品/数据合同。
- 普通文件附件继续走消息级 `files`，不要升级成 artifact。

### 5. 工作画布安全边界

你需要和团队确认：

- 是否始终使用 sandboxed iframe
- 哪些内容允许脚本
- 哪些内容必须 sanitization
- host 和 artifact 之间是否需要消息通信
- `url` 型 work canvas 是否只来自受信任的上游 URL
- node/web 应用的 iframe 嵌入是否已正确配置 CSP / frame headers

前端当前实现：

- 第一版默认 sandboxed iframe。
- `html` 型 artifact 走 `srcdoc`；默认不放开脚本，只有 artifact payload 显式 `allowScripts` 时才加 `allow-scripts`。
- `url` 型 work canvas 只用于受信任 node/web 应用，不作为任意外站嵌入能力
- `url` iframe 当前只放开 `allow-scripts`。
- 前端只接受相对路径，或来自 `VITE_CAREER_AGENT_TRUSTED_CANVAS_ORIGINS` allowlist 的 http/https URL。

URL 型工作画布需要上游返回：

- `render_mode: url`
- `payload.url`
- URL 来源是否稳定可嵌入
- 是否需要 host 与 iframe 的 postMessage 通道

真实生成产物的分离规则：

- 纯 HTML 小页面：优先返回 `render_mode: html` 和 `payload.html`，由前端通过 sandboxed iframe `srcdoc` 渲染
- 大型 HTML 或带静态资源的页面：由上游服务托管成受信任 HTTP URL，再返回 `render_mode: url` 和 `payload.url`
- node 项目或交互式 web 应用：由上游负责启动、托管和生命周期管理，再返回可嵌入的 `payload.url`
- 不建议让前端直接接收 `/Users/.../xxx.html` 这类本机绝对路径
- 不建议让前端直接接收 `file://...` URL
- 不建议让前端自己启动或管理 node 项目

### 6. 上传与多模态

已对齐并可联调：

- `POST /api/career-agent/threads/:threadId/files`：浏览器以 `multipart/form-data` 直传单个 `file`，server 返回 `asset_id`、浏览器可访问 URL、文件名、mime 和大小。
- `POST /api/career-agent/threads/:threadId/messages`：请求体支持 `attachment_asset_ids`，前端只传 asset id，不把文件二进制或 base64 混入消息 JSON。
- 发送成功后，前端重新拉取 `GET /api/career-agent/threads/:threadId/messages`，以服务端消息历史作为权威来源。
- Composer 已支持图片和文件的本地选择、本地 object URL 预览；mock 模式模拟上传与回复，upstream 模式走当前后端直传接口。

未来生产上传架构仍需后端决策：

- 第一选择：三段式直传对象存储，流程为 `initiate/presign -> browser PUT binary -> complete`。
- 本地开发当前已采用 server 本地磁盘直传方案；如果后续切到对象存储，应保持发送消息引用 `attachment_asset_ids` 的语义不变，减少前端重写。
- 前端不保存密钥，不直接决定存储路径，不信任浏览器传来的 mime 类型作为唯一依据。
- `POST /api/career-agent/uploads/initiate`：接收 `file_name`、`mime_type`、`file_size_bytes`、`thread_id`、`kind`，校验用户、线程、大小、数量和 mime 白名单，返回 `upload_id`、`upload_url`、`upload_headers`、`expires_at`。
- `PUT upload_url`：浏览器直接上传二进制；生产建议指向对象存储预签名地址，本地开发可指向 server 临时上传地址。
- `POST /api/career-agent/uploads/complete`：接收 `upload_id` 和 `thread_id`，server 验证文件确实存在、大小和类型匹配，然后返回 `asset_id`、`kind`、`url`、`mime_type`、`size_bytes`。
- `POST /api/career-agent/threads/:threadId/messages` 保持当前语义：server 校验 asset 属于当前用户和线程，再把附件交给 agent runtime。
- 建议新增 asset 表或等价持久化记录：`asset_id`、`user_id`、`thread_id`、`message_id`、`status`、`storage_key`、`original_name`、`mime_type`、`size_bytes`、`created_at`、`expires_at`。
- 需要后台清理过期未完成上传、孤儿 asset 和临时文件。
- 图片可选做缩略图、尺寸读取和安全扫描；普通文件至少要做大小限制、类型限制和下载鉴权。

### 7. Profile 写入权

你需要和团队确认：

- 对话建议能否直接改画像
- 是否必须通过明确的 UI 确认后才持久化

当前前端默认态度：

- 结构化 profile 是真相来源
- 对话只能建议，不能静默改写

## 暂缓与暂不做

### 暂缓做

这些想法合理，但现在先不进入当前阶段：

- 左侧线程做成文件夹 / 项目树
- 按“一个大计划下多个会话”重建导航模型
- 左右区域可调宽但仍固定在壳体结构里的分栏拖拽

暂缓原因：

- 会牵涉更深的数据模型和信息架构
- 现在先把壳体行为和对话驱动路径做稳更重要

### 暂时不做

这些方向当前不建议进入 MVP：

- 自由拖动的浮动窗口
- 右侧画布像桌面软件一样任意漂浮
- 为了树形导航而提前重构线程数据结构

暂时不做原因：

- 复杂度高
- 对产品核心价值帮助有限
- 很容易把壳体做成窗口管理器，反而损伤可用性

## 开发环境提醒

### GitHub PR 工作流

当前默认做法：

- 使用仓库内中文 PR 模版
- PR 可以直接创建为 `Ready for review`；如果先创建 draft，完成自检后再切换
- 优先等待 Copilot 自动审查返回
- 优先等待约 `5-10` 分钟，不在 PR 创建后立刻主动召唤 Copilot
- 如果等待窗口后仍没返回，再由 Codex 主动请求 Copilot reviewer
- Copilot 返回后，再检查并修正有效问题
- 每个 PR 默认只处理一轮 Copilot 审查；修复有效问题后不再等待第二轮，除非出现真实阻塞

你可以重点查看：

- `docs/zh/pr-workflow.md`

如果某次 PR 没有等到 Copilot 自动评论，需要确认：

- 仓库是否启用了对应的 Copilot review 能力
- PR 是否已经切换到 `Ready for review`
- GitHub 本身是否只是审查延迟
- 是否已经主动请求 `@copilot` reviewer

### 测试基线

从 Phase 5 开始，PR 前需要执行：

- `npm run test`
- `npm run build`

测试策略详见：

- `docs/frontend-testing-strategy.md`

## 当你发现团队开始分歧时

优先检查这三份文档：

- `docs/career-agent-spec.md`
- `DESIGN.md`
- `docs/frontend-implementation-plan.md`

如果问题属于：

- 产品目标或边界：改 spec
- 视觉与壳体表现：改 design
- 前端落地顺序：改 implementation plan

不要把这些决定散落在聊天记录里。
