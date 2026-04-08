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

### 3. HTML 渲染安全边界

你需要和团队确认：

- 是否始终使用 sandboxed iframe
- 哪些内容允许脚本
- 哪些内容必须 sanitization
- host 和 artifact 之间是否需要消息通信

当前前端默认态度：

- 第一版默认 sandboxed iframe

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
