# Team Sync

## 作用

这个文档只记录两类事情：

- 需要你去确认或推动的跨团队事项
- 需要前端仓库与上游 `claude-code-rev` 仓库对齐的集成事项

它不是产品 spec，也不是设计文档。

## 当前默认结论

- 当前前端仓库已经可以正式开始搭框架
- 当前 demo 不是产品真相来源，可以随实现推进继续删改
- 前端仓库只负责前端壳体和 API client / adapter 设计
- 后端、agent、artifact 生成逻辑由另一仓库负责
- 当前已经完成前端基础设施阶段，接下来先做壳体行为优化，再做对话驱动工作流

## 右侧面板的当前产品定义

前端内部术语仍然可以叫：

- `artifact host`
- `artifact pane`

但从产品理解上，它不只是“右侧预览面板”，更接近：

- work canvas
- 工作画布
- 结果工作区

它未来要承载的内容不只包括计划类 artifact，还包括：

- 模拟面试界面
- 代码题或线上测评界面
- 不同职业场景的面试模拟
- 趣味学习 / 可视化学习界面

当前默认判断：

- 桌面端默认仍是“中间对话 + 右侧画布并行”
- 需要时进入 `Artifact Focus`
- 模拟面试、代码题、可视化学习优先进入 `Immersive Canvas / 沉浸式工作画布`
- 不把右侧画布当成 modal
- 不把右侧画布当成纯预览区

关于沉浸式任务的当前产品判断：

- 沉浸式任务可以默认隐藏左侧边栏
- 对话区可退成一条轻量返回路径，而不是继续占据主视图
- MVP 不默认另开浏览器新窗口
- 新窗口模式可以以后再评估，但当前不作为主路径

## 当前稳定工作流

当前已经不再按 4 月 8/9 的“今天/明天”拆分推进。无上下文模型接手时，应以本节为当前状态。

默认 `npm run dev` 可验证：

- `thread-001` 到 `thread-008` 的 mock 会话
- 对话消息通过 `open-artifact` action 打开工作画布
- 周计划、职业方向、模拟面试、代码题、二次函数可视化等工作画布
- reasoning 折叠展示
- 最小多 agent 名称和颜色展示
- 对话内图片和视频媒体展示

`npm run dev:app-examples` 可验证：

- `thread-009` 静态 HTML 外部应用 URL
- `thread-010` Node / Web 外部应用 URL
- 前端只消费 URL，不启动外部项目

下一步不应宽泛重构。应先从一个明确 slice 开始，例如：

- 会话发送 / pending / error / retry
- 工作画布交互事件回传 contract
- session / thread 数据管理边界
- 上传文件入口和资源 URL 合同
- 工件列表与会话内历史工件关系

当前最新推进：

- 对话消息已经可以通过 `open-artifact` action 打开工作画布
- 会话页顶部旧的调试型“打开画像摘要 / 打开周计划”按钮已移除
- mock 里新增了模拟面试、代码题演练、可视化学习三条会话
- 三条会话分别对应 `mock-interview`、`coding-assessment`、`visual-learning` 画布例子
- `dev:app-examples` 配置下会注册两个外部应用示例会话：`thread-009` 静态 HTML 应用 URL、`thread-010` Node 应用 URL

## 你需要持续关注的沟通项

### 0. 当前 4000 端口 server 联调事实

更新时间：2026-04-20

前端已按 `axios` 接入当前 server 的读取路径，并以 `VITE_CAREER_AGENT_API_BASE_URL=http://localhost:4000` 作为本地联调默认示例。

当前从 `/Users/fancy/code/Career-Agent/server` 看到的真实接口是：

- `POST /api/career-agent/threads`：创建会话
- `GET /api/career-agent/threads/:id`：当前 `:id` 实际是用户 id，不是会话 id
- `GET /api/career-agent/threads/:id/messages`：当前 `:id` 是会话 id
- `GET /api/career-agent/artifacts/:id`：当前 controller 参数名像单详情，但 service 实际按 `uid` 返回工件列表

需要你和 server 同学确认或推动：

- `POST /api/career-agent/threads` 需要由后端保证 `createdAt` / `updatedAt` 默认值，否则当前实体的 `createdAt` 非空约束可能导致新建失败。
- 如果要符合接口图里的 `GET /api/career-agent/artifacts` 和 `GET /api/career-agent/artifacts/:artifactId`，server 需要区分“工件列表”和“单工件详情”，当前实现还没有真正的单工件详情。
- `POST /api/career-agent/artifacts/:artifactId/refresh` 当前 server 未实现，前端只保留了可调用入口和 404 兼容。
- 当前前端已接入 server 后续提供的 `POST /api/career-agent/threads/:id/files` 和 `POST /api/career-agent/threads/:id/messages`，可按“直传附件 -> 引用 asset id 发送消息 -> 刷新消息历史”的路径联调。

### 1. 上游 artifact payload 对齐

你需要和后端 / agent 团队确认：

- artifact 的 `id`
- `type`
- `title`
- `status`
- `render_mode`
- `revision`
- `payload`
- `updated_at`

目标：

- 前端 mock contract 最终不要和上游真实 payload 差太多

### 2. 实时回传机制

你需要确认上游最终准备用什么方式把 artifact 更新推给前端：

- polling
- SSE
- WebSocket
- 其他事件通道

当前前端默认态度：

- 先按可替换 adapter 设计，不阻塞框架搭建
- 当前前端保留了 `polling / SSE / WebSocket` 三种 transport 枚举，默认仍是 `polling`

### 2.1 当前前端约定的环境变量

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

### 2.2 工作画布反馈事件契约

你还需要和后端 / agent 团队确认：

- 右侧工作画布中的交互，是否作为结构化事件回传给 agent
- 这些事件是否同时绑定 `thread_id` 和 `artifact_id`
- agent 更新后，是回传新消息、更新 artifact revision，还是两者都回传

当前前端默认态度：

- 模拟面试、代码题、可视化学习等工作画布都应该进入 agent 反馈回路
- 前端只发送结构化交互事件，不负责 agent 推理
- 前端需要一个稳定的 typed event contract，而不是读取任意 DOM 状态

建议至少对齐这些字段：

- `thread_id`
- `artifact_id`
- `artifact_revision`
- `interaction_type`
- `action_id`
- `payload`
- `created_at`

### 2.3 对话动作合同

当前前端已经支持第一类对话动作：

- `kind: open-artifact`
- `label`
- `artifact_id` / `artifactId`
- `view_mode` / `viewMode`

默认含义：

- agent 返回的消息可以携带动作
- 前端只负责把动作渲染成按钮，并打开对应工作画布
- 前端不根据自然语言自行推理要打开哪个画布
- `viewMode` 可用于决定默认进入 `pane`、`focus` 或 `immersive`

### 3. HTML 渲染安全边界

你需要和团队确认：

- 是否始终使用 sandboxed iframe
- 哪些内容允许脚本
- 哪些内容必须 sanitization
- host 和 artifact 之间是否需要消息通信
- `url` 型 work canvas 是否只来自受信任的上游 URL
- node/web 应用的 iframe 嵌入是否已正确配置 CSP / frame headers

当前前端默认态度：

- 第一版默认 sandboxed iframe
- `html` 型 artifact 继续走高隔离 `srcdoc`
- `url` 型 work canvas 只用于受信任 node/web 应用，不作为任意外站嵌入能力
- 第一版 `url` iframe 从最小 sandbox 面开始，只放开 `allow-scripts`

### 3.1 当前前端约定的 API 路径

如果上游团队准备提供真实接口，需要先确认这些路径是否接受：

- `GET /api/career-agent/threads/:userId`
- `GET /api/career-agent/threads/:threadId/messages`
- `GET /api/career-agent/profile`
- `PUT /api/career-agent/profile`
- `GET /api/career-agent/profile/suggestions`
- `GET /api/career-agent/artifacts`
- `GET /api/career-agent/artifacts/:artifactId`
- `POST /api/career-agent/artifacts/:artifactId/refresh`

如果路径或字段命名不同，应该尽早同步给前端，而不是等页面接完再改。

### 3.2 对话消息扩展合同

如果上游准备开始返回更丰富的对话消息，需要尽早对齐这些字段：

- `reasoning` 或兼容性 `think`
- `agent_id`
- `agent_name`
- `agent_accent`

当前前端默认态度：

- reasoning 默认折叠，不默认展开
- 前端可兼容 `<think>...</think>`，但长期应改为显式字段
- 多 agent 第一版只做名称和颜色区分，不做复杂编排 UI
- 只有同一会话里出现多个 assistant 身份时，才启用名称 / 颜色差异化
- 单 assistant 会话继续使用统一的助手呈现，不强行暴露 agent 编排感

### 3.3 URL 型工作画布合同

如果上游准备返回 node/web 应用 URL，需要尽早对齐：

- `render_mode: url`
- `payload.url`
- URL 来源是否稳定可嵌入
- 是否需要 host 与 iframe 的 postMessage 通道

当前前端默认态度：

- `html` 和 `url` 是两种不同信任级别的宿主模式
- `url` 模式用于受信任应用，不等同于“打开任意网页”
- 这类 URL 最好由上游统一控制来源，而不是由前端拼接
- 前端当前只接受相对路径，或来自 allowlist 的 http/https URL

### 3.4 本地 work canvas 验证资产

仓库里现在应保留一套本地验证资产，帮助前端在没有真实后端联调时验证：

- `html` 型 artifact 的 `srcdoc` 路径
- same-origin `url` 型 work canvas
- cross-origin node/web 项目 URL

当前前端默认态度：

- `tests/work-canvas/README.md` 负责说明本地验证流程
- `public/mock-node-canvas/index.html` 继续作为 same-origin URL 示例
- `tests/work-canvas/node-fixture/server.mjs` 用于模拟独立 node 项目
- `../app_examples/bounce-game` 用于验证外部静态 HTML 应用 URL
- `../app_examples/derivative-game` 用于验证外部 Node / Web 应用 URL
- 前端不负责启动真实 node 项目，只负责消费 URL 并嵌入 iframe

当前边界补充：

- `public/mock-node-canvas/index.html` 和 `tests/work-canvas/node-fixture/server.mjs` 是旧的宿主能力 fixture，用来验证 iframe、allowlist 和 URL 模式
- `../app_examples` 是更接近后续真实生成产物的本地外部示例来源；如果本机路径不同，用环境变量覆盖本地运行命令
- 静态 HTML 示例也不建议通过 `file://` 或 `/Users/.../index.html` 直接返回给前端，应由后端或本地静态服务转成 HTTP URL
- Node 示例需要由外部进程启动；前端不启动、不守护、不重启该进程

### 3.5 开发例子和真实生成产物的分离规则

当前这些开发例子只用于前端验证，不是后续真实 artifact 生成链路：

- `src/services/mockCareerAgentClient.ts`：前端 mock 数据，直接构造 `ArtifactRecord`
- `public/mock-node-canvas/index.html`：同源静态 URL 示例，用来验证 `render_mode: url`
- `tests/work-canvas/node-fixture/server.mjs`：本地 node fixture，用来模拟独立 node/web 应用 URL
- `../app_examples/bounce-game`：前端仓库外的静态 HTML 应用示例，测试时通过 HTTP URL 嵌入
- `../app_examples/derivative-game`：前端仓库外的 Node 应用示例，测试时由示例项目自己启动服务，再把 URL 交给前端

后续接入真实上游时，前端应只消费统一 artifact contract，而不是依赖这些开发例子：

- 纯 HTML 小页面：优先返回 `render_mode: html` 和 `payload.html`，由前端通过 sandboxed iframe `srcdoc` 渲染
- 大型 HTML 或带静态资源的页面：由上游服务托管成受信任 HTTP URL，再返回 `render_mode: url` 和 `payload.url`
- node 项目或交互式 web 应用：由上游负责启动、托管和生命周期管理，再返回可嵌入的 `payload.url`

不建议的方式：

- 不建议让前端直接接收 `/Users/.../xxx.html` 这类本机绝对路径
- 不建议让前端直接接收 `file://...` URL
- 不建议让前端自己启动或管理 node 项目

原因：

- 浏览器直接访问本地文件会遇到安全、权限、跨机器路径不可用等问题
- 前端运行环境不一定和后端 / agent 生成文件的机器是同一台
- node 项目需要端口、进程生命周期、CSP / frame headers，这些都属于上游运行时责任

当前推荐决策：

- 如果 agent 生成的是一份简单单 HTML，后端读取文件内容并作为 `payload.html` 返回
- 如果 agent 生成的是多文件页面或 node/web 项目，后端把它转成受信任 URL，并把 URL 返回给前端
- 前端继续保留 `html` 与 `url` 两条宿主路径，后续只替换数据来源，不重写画布宿主
- `html` 模式默认不放开脚本；当前只有显式标记为 `allowScripts` 的前端 mock 交互示例会启用脚本
- 真实上游如果需要可执行 HTML，应先重新审查安全边界；默认建议仍是转为受信任 `url` 模式

### 3.6 对话多模态媒体合同

当前先做第一层能力：

- AI / 后端已经拿到图片或视频位置
- 上游消息返回 `media` / `attachments`
- 前端在对话消息中展示图片或视频播放器

当前前端支持的字段：

- `id`
- `kind` / `type`：`image` 或 `video`
- `url` / `src`
- `title`
- `caption`
- `alt`
- `mime_type` / `mimeType`
- `poster_url` / `posterUrl`

当前前端默认态度：

- 这是“展示已可访问媒体”的能力，不是上传能力
- 不接受 `file://...` 作为上游媒体 URL
- 本地开发 fixture 放在 `public/mock-media/` 下，用相对路径验证图片显示和视频播放
- 真实上游应返回浏览器可访问的相对路径或受信任 HTTP URL
- 如果图片 / 视频是结果页的一部分，应作为 artifact HTML / URL 页面内部资源展示，而不是新增独立的“图片工件 / 视频工件”类型
- 如果图片 / 视频只是对话上下文附件，应继续使用消息级 `media` / `attachments`

Composer 已支持图片和文件的本地选择、本地 object URL 预览。mock 模式会模拟上传与回复；upstream 模式会按当前 server 的会话文件直传接口上传附件，并在发送消息时引用 `attachment_asset_ids`。

当前已接入的本地联调架构：

- `POST /api/career-agent/threads/:threadId/files`：浏览器以 `multipart/form-data` 直传单个 `file`，server 返回 `asset_id`、浏览器可访问 URL、文件名、mime 和大小。
- `POST /api/career-agent/threads/:threadId/messages`：请求体支持 `attachment_asset_ids`，前端只传 asset id，不把文件二进制或 base64 混入消息 JSON。
- 发送成功后，前端重新拉取 `GET /api/career-agent/threads/:threadId/messages`，以服务端消息历史作为权威来源。

未来生产上传架构：

- 第一选择：三段式直传对象存储，流程为 `initiate/presign -> browser PUT binary -> complete`。
- 本地开发当前已采用 server 本地磁盘直传方案；如果后续切到对象存储，应保持发送消息引用 `attachment_asset_ids` 的语义不变，减少前端重写。
- 前端不保存密钥，不直接决定存储路径，不信任浏览器传来的 mime 类型作为唯一依据。

未来三段式方案中，建议后端 / server 需要实现：

- `POST /api/career-agent/uploads/initiate`：接收 `file_name`、`mime_type`、`file_size_bytes`、`thread_id`、`kind`，校验用户、线程、大小、数量和 mime 白名单，返回 `upload_id`、`upload_url`、`upload_headers`、`expires_at`。
- `PUT upload_url`：浏览器直接上传二进制；生产建议指向对象存储预签名地址，本地开发可指向 server 临时上传地址。
- `POST /api/career-agent/uploads/complete`：接收 `upload_id` 和 `thread_id`，server 验证文件确实存在、大小和类型匹配，然后返回 `asset_id`、`kind`、`url`、`mime_type`、`size_bytes`。
- `POST /api/career-agent/threads/:threadId/messages` 保持当前语义：server 校验 asset 属于当前用户和线程，再把附件交给 agent runtime。
- 建议新增 asset 表或等价持久化记录：`asset_id`、`user_id`、`thread_id`、`message_id`、`status`、`storage_key`、`original_name`、`mime_type`、`size_bytes`、`created_at`、`expires_at`。
- 需要后台清理过期未完成上传、孤儿 asset 和临时文件。
- 图片可选做缩略图、尺寸读取和安全扫描；普通文件至少要做大小限制、类型限制和下载鉴权。

前端当前已负责：

- 在 composer 中维护本地附件预览，并在提交时执行上传、发送、刷新历史。
- 上传成功后只把 `asset_id` 放入发送消息请求。
- 上传、发送、刷新历史失败时保留 pending 消息并显示阶段化错误。
- 对图片继续用消息级 `media` 展示；普通文件继续用消息级 `files` 展示，不把它们升级成 artifact。

推荐顺序：

- 先完成对话内图片 / 视频展示。
- 再完成 composer 本地图片 / 文件附件 UI。
- 当前直传方案已经完成前端接入；后续可补显式 retry UI。
- 如后端切换对象存储，再接入三段式上传队列。
- 最后再扩展视频上传、语音输入和更复杂的多模态工作流。

### 4. Profile 写入权

你需要和团队确认：

- 对话建议能否直接改画像
- 是否必须通过明确的 UI 确认后才持久化

当前前端默认态度：

- 结构化 profile 是真相来源
- 对话只能建议，不能静默改写

### 5. 鉴权与用户态

你需要确认：

- 第一版是否真的需要登录
- 如果需要，前端是否先做假 session
- 线程、画像、artifact 是否都绑定用户身份

当前前端默认态度：

- 可以先用本地 mock / placeholder，不阻塞壳体搭建

## 当前不阻塞开工的事项

这些事重要，但不需要等它们彻底定完才开始前端：

- 第三种 artifact 之后的优先级
- 语音接入的具体方案
- Home 页以后是否强化推荐逻辑
- 更复杂的计划视图和图表

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
