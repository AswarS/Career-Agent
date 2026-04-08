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
- 不把右侧画布当成 modal
- 不把右侧画布当成纯预览区

## 近期执行顺序

当前已锁定的近两步顺序：

- 2026 年 4 月 8 日：只做壳体行为优化
- 2026 年 4 月 9 日：开始对话驱动工作流

今天的行为优化范围：

- 左侧边栏折叠
- 左侧边栏独立滚动
- 长线程列表独立滚动
- 右侧画布在不同桌面宽度下的行为优化

明天才开始的范围：

- 对话真正触发工作画布
- composer 的发送 / 处理中 / 失败回退
- 图片预览这条真实多模态路径

## 你需要持续关注的沟通项

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

### 2.1 当前前端约定的环境变量

如果上游准备开始联调，需要先对齐这些环境变量：

- `VITE_CAREER_AGENT_CLIENT_MODE`
- `VITE_CAREER_AGENT_API_BASE_URL`
- `VITE_CAREER_AGENT_ARTIFACT_TRANSPORT`
- `VITE_CAREER_AGENT_ENABLE_VOICE_INPUT`

默认示例见：

- `.env.example`

### 3. HTML 渲染安全边界

你需要和团队确认：

- 是否始终使用 sandboxed iframe
- 哪些内容允许脚本
- 哪些内容必须 sanitization
- host 和 artifact 之间是否需要消息通信

当前前端默认态度：

- 第一版默认 sandboxed iframe

### 3.1 当前前端约定的 API 路径

如果上游团队准备提供真实接口，需要先确认这些路径是否接受：

- `GET /api/career-agent/threads`
- `GET /api/career-agent/threads/:threadId/messages`
- `GET /api/career-agent/profile`
- `PUT /api/career-agent/profile`
- `GET /api/career-agent/profile/suggestions`
- `GET /api/career-agent/artifacts`
- `GET /api/career-agent/artifacts/:artifactId`
- `POST /api/career-agent/artifacts/:artifactId/refresh`

如果路径或字段命名不同，应该尽早同步给前端，而不是等页面接完再改。

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
- 提交后由 Codex 在终端里把 draft PR 切到 `Ready for review`
- 优先等待 Copilot 自动审查返回
- 如果几分钟内没返回，就由 Codex 执行 `gh pr edit <pr-number> --add-reviewer @copilot`
- Copilot 返回后，再检查并修正有效问题

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
