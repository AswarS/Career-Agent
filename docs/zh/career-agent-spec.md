# 生涯 Agent 产品规格说明

## 状态

MVP 方向 `v1 锁定稿`，用于审查。

## 语言说明

本文件是面向中文审查的规格说明。

对应的实现侧英文版本位于：

- `docs/career-agent-spec.md`

两份文件应保持同步。
如果后续出现不一致，应先对齐文档，再继续实现。

## 产品概述

构建一个用于个人生涯规划的 agent 应用，整体工作台布局参考 Codex 一类工具：

- 左侧导航：线程、画像、工作区入口
- 中间主区域：对话与推理内容
- 右侧或全宽区域：实时生成的 artifact / HTML 工作面板

产品要帮助个人处理以下问题：

- 求职
- 当前工作
- 学习与提升
- 生活平衡与长期规划

这个应用应当同时具备以下属性：

- 顾问
- 工作台
- 规划系统

它不应看起来像：

- 纯聊天机器人
- 客服后台
- 静态 dashboard

## 核心用户

### 1. 生涯探索者

这类用户正在判断自己适合什么方向、下一步该怎么走。

需求：

- 结构化引导
- 用户画像建立
- 反思式提问
- 可执行建议

### 2. 活跃求职者

这类用户正在准备简历、作品集、投递和面试。

需求：

- 有针对性的建议
- 实时 artifact 生成
- 进度跟踪
- 文档与策略支持

### 3. 在职成长者

这类用户需要同时平衡当前工作、学习成长和生活约束。

需求：

- 规划支持
- 优先级判断
- 学习路径建议
- 可持续节奏

## 产品目标

### 核心目标

帮助用户从模糊焦虑走到清晰的下一步行动，并且这个过程由 AI agent 和实时交互 artifact 共同支撑。

### 支撑目标

- 通过清晰结构和可靠输出建立信任
- 让用户能实时看到并编辑生成结果
- 支持长会话和持续积累的用户上下文
- 让前后端团队可以渐进式迭代

## 初期非目标

- 企业级多人协作
- Notion 级别的完整文档编辑器
- 任意插件市场
- 高度定制的重图表或重 Canvas 视觉系统
- 在桌面壳体尚未稳定前就优先做移动端优先体验

## 核心产品逻辑

产品围绕三个相互连接的系统工作：

### 1. 持久化用户上下文

系统需要存储并更新：

- 用户画像
- 当前目标
- 现实约束
- 偏好
- 最近计划
- 历史对话

这些信息会影响后续回答和生成的 artifact。

### 2. 对话式规划

用户通过对话与系统协作。
系统应当能够：

- 提出澄清问题
- 总结上下文
- 推荐下一步
- 生成具体结果

对话不仅是问答界面，也是规划工作的控制面。

### 3. 实时 Artifact 生成

agent 可以生成一个 artifact，并在右侧面板打开，或者接管主工作区。

示例：

- 用户画像摘要
- 周计划
- 路线图
- 简历提纲
- 面试准备板
- 模拟面试代码题界面
- 不同岗位的线上面试模拟界面
- 学习安排
- 可视化学习板
- 可探索式学习模块
- 投递跟踪器

这些 artifact 必须能够随着后端数据回传实时更新。

内部实现术语：

- `artifact`

更适合用户理解的心智模型：

- work canvas
- canvas
- 工作画布

并不是所有 artifact 都是文档。
其中一部分会是交互式任务界面、模拟界面或可视化学习界面。

## 信息架构

长期形态的顶层区域：

1. Home
2. Conversations
3. Profile
4. Plans
5. Artifacts
6. Settings

## 已锁定的 MVP 决策

以下决策现在视为已确认默认值，除非你明确要求改动。

### 桌面默认模式

- 默认模式：`Conversation First`
- artifact 按需在右侧面板打开
- 必要时可提升为 `Artifact Focus`

### 第一条要实现的路径

首条要验证的真实路径是：

- 对话工作区
- 精简版用户画像
- 一个 `weekly plan` artifact

这是项目第一条需要端到端跑通的路径。

### Artifact 宿主模型

- 生成的 HTML 默认在右侧面板打开
- 默认宿主模型：`sandboxed iframe`
- 需要时支持全宽 artifact 模式

### 用户画像的真相来源

- 结构化 profile 数据是系统真相来源
- 对话可以提出修改建议
- 最终写入与变更应通过显式 UI 操作确认

### MVP 多模态范围

第一阶段：

- text
- markdown
- image preview

第二阶段：

- voice input

### MVP 一级导航

第一轮实现的主导航建议为：

- Threads
- Profile
- Artifacts
- Settings

`Home` 可以先作为轻量欢迎页或空状态存在。  
`Plans` 不应在第一轮就做成一级入口。

### Home

用途：

- 欢迎入口
- 展示当前重点
- 恢复最近线程
- 给出建议的下一步

### Conversations

用途：

- 长对话与 agent 协作
- markdown 和多模态交换
- artifact 的发起入口

### Profile

用途：

- 收集与编辑用户画像
- 展示目标、约束、偏好和阶段性标记

### Plans

用途：

- 结构化展示职业、工作、学习和生活规划

### Artifacts

用途：

- 查看生成结果列表
- 重新打开、对比、修订和导出 artifact
- 承载模拟面试、可视化学习等交互式工作画布

## 壳体模式

应用需要明确的布局模式。

### 模式 A：Conversation First

适用场景：

- 用户还在探索
- artifact 尚未激活

布局：

- 左侧导航
- 中央对话区

### 模式 B：Conversation + Artifact

适用场景：

- 用户一边讨论，一边查看已生成计划

布局：

- 左侧导航
- 对话区
- 右侧 artifact 面板

### 模式 C：Artifact Focus

适用场景：

- 生成的 HTML 已成为主要工作面
- 用户需要集中查看或操作实时产物
- 用户正在进行模拟面试或可视化学习流程

布局：

- 左侧导航可选
- artifact 占据大部分屏幕
- 对话缩成抽屉、标签页或可折叠区域

### 模式 D：Profile Setup

适用场景：

- onboarding
- 大幅修改画像信息

布局：

- 引导式表单或访谈流
- 对话支持可保留，但应当退居次要位置

## 实时渲染规格

后端可能向 agent 返回结构化数据和已渲染 HTML 更新。
前端必须在稳定宿主壳体中承载持续变化的 artifact。

### 必备行为

- 生成 HTML 默认在右侧面板打开
- 支持提升为全屏或主视图模式
- 支持流式更新，避免整页重刷
- 尽量保留用户滚动位置
- 显示渲染状态：`loading / streaming / ready / stale / error`

右侧宿主不只是阅读区。
它也可能成为以下内容的主要工作区：

- 计划结果
- 模拟面试
- 代码题界面
- 可视化学习体验

### 推荐集成模型

前端宿主应能接收这类 artifact 载荷：

- artifact id
- title
- render mode
- html payload 或 structured payload
- revision number
- status
- metadata

### 交互式工作画布反馈回路

有些工作画布不是被动输出，而是交互式任务界面。
用户在其中的操作必须回流到 agent，再驱动下一轮更新。

这对以下场景尤其重要：

- 模拟面试
- 代码题或编程面试
- 引导式学习流程
- 面向求职者的自适应练习界面

必备交互模型：

1. agent 打开或更新一个工作画布
2. 用户在该画布中进行操作
3. 前端宿主把该操作捕获为结构化事件
4. 前端把这个事件发送回上游 agent 系统
5. 上游系统返回以下一种或两种结果：
   - 更新后的对话消息
   - 更新后的 artifact revision 或画布状态
6. 前端在不重置整个壳体的前提下，同时协调对话区与工作画布

前端应把它视为“类型化反馈回路”，而不是随意读取 DOM。

最小反馈事件结构应支持：

- `thread_id`
- `artifact_id`
- `artifact_revision`
- `interaction_type`
- `action_id`
- `payload`
- `created_at`

典型交互类型示例：

- `answer_submitted`
- `choice_selected`
- `hint_requested`
- `step_completed`
- `timer_finished`
- `reflection_logged`

产品意图：

- 工作画布应根据用户真实操作动态适配
- agent 不应只对聊天文本做反应
- 对求职者场景来说，系统应根据互动过程来调整，而不是只根据显式提问调整

### 宿主职责

- 展示 artifact 生命周期状态
- 隔离壳体布局与 artifact 内部实现
- 保留导航与返回路径
- 支持重渲染与版本替换
- 让工作画布可以作为主要任务区使用，而不是仅作为预览窗格
- 保持“工作画布交互 -> agent 更新 -> 画布/对话再更新”的闭环

### 安全约束

生成的 HTML 应被视为受控 artifact 面。
实现时应预先考虑：

- sanitization 策略
- 样式隔离策略
- script 执行策略
- host 与 artifact 的通信契约

初期建议：

- 对风险内容优先使用 sandboxed iframe 或受控容器
- 保持宿主壳体与生成 artifact 样式隔离

## 多模态支持

初期支持的输入模态：

- text
- markdown
- image input
- voice input

计划支持的输出形态：

- markdown responses
- image previews
- generated HTML
- structured cards
- plans and timelines

### Voice

语音应作为输入路径扩展，而不是独立产品。
输入器应支持：

- 开始/停止录音
- 转写预览
- 编辑后发送转写内容

### Images

图片应支持：

- 上传
- 预览
- 附加到某个对话回合
- 后续扩展到分析工作流

### Markdown

Markdown 是一等公民。
渲染器至少应支持：

- 标题
- 列表
- 链接
- 代码块
- 必要时支持表格
- callout 或引用块

## MVP 核心页面

### 1. Home

包含：

- 欢迎状态
- 当前重点
- 最近线程
- 建议的下一步

### 2. Conversation Workspace

包含：

- 线程式消息流
- 富文本 assistant 响应
- 带多模态动作的输入器
- artifact 发起区域

### 3. Profile

包含：

- 基本身份与当前处境
- 目标岗位或方向
- 约束条件
- 优势与风险

### 4. Artifact Workspace

包含：

- artifact 头部
- 渲染容器
- 版本状态
- 操作控件

## 建议的构建顺序

由于你目前还处在 AI 协作开发的早期阶段，第一版实现应避免过度设计。

### Phase 1

- app shell
- left rail
- conversation view
- static profile page
- artifact pane host
- markdown rendering

### Phase 2

- live artifact switching
- user profile persistence
- image and voice input
- loading and streaming states

### Phase 3

- richer plans
- artifact history
- compare revisions
- more advanced multimodal workflows

## AI 协作工作流

这个项目推荐按以下方式与 AI 协作：

1. 一次只定义一个 slice
2. 先写清数据合同
3. 先搭宿主壳体，再做复杂 artifact 内容
4. 先验证 loading、empty、success、error
5. 最后再做细节视觉打磨

这样能显著降低 AI 生成前端时的漂移风险。

## 仍可继续讨论的问题

这些问题仍值得继续思考，但已不阻塞第一轮实现：

1. 当壳体稳定后，`Home` 的推荐引擎应该多强？
2. `weekly plan` 之后，第二个 artifact 应该优先是什么？
3. 有多少编辑行为应该发生在 artifact 内部，而不是对话里？
4. 语音何时应从第二阶段进入主工作流？
5. `Plans` 最终是否应该成为一级导航，而不是维持 artifact 驱动？

## 下一轮实现前应锁定的内容

在下一轮正式实现前，至少应锁定：

- profile schema outline
- first three artifact types
- final design token file
