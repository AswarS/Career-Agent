# 职业规划前端联调 API 文档（推荐版）

## 1. 文档定位

这是一份面向当前前端仓库的推荐联调合同，目标是：

1. 与现有前端实现完全对齐
2. 先跑通稳定的 v1 最小接口集
3. 把会话写操作（发送、新建、删除）作为二阶段扩展

设计依据：

- 前端路由常量: [../../src/services/careerAgentApiRoutes.ts](../../src/services/careerAgentApiRoutes.ts#L1)
- 前端客户端接口: [../../src/services/careerAgentClient.ts](../../src/services/careerAgentClient.ts#L1)
- 上游字段兼容规则: [../../src/services/upstreamContracts.ts](../../src/services/upstreamContracts.ts#L1)
- 产品核心对象约束: [../career-agent-spec.md](../career-agent-spec.md#L367)

## 2. 设计原则

1. 分域模型优先

使用 thread / message / profile / artifact 四类核心对象。

2. 最小联调优先

先对齐已落地的 8 个接口，避免一次性引入高风险改造。

3. 向后兼容优先

过渡期兼容 snake_case 与 camelCase 关键字段，减少联调阻塞。

4. 职责边界清晰

- message 承载文本、动作、图片/视频媒体
- artifact 承载 html/url/markdown/cards 结果面板

## 3. 基本约定

### 3.1 基础路径

/api/career-agent

### 3.2 内容类型

- 请求: application/json; charset=utf-8
- 响应: application/json; charset=utf-8

### 3.3 成功返回

v1 推荐直接返回业务对象，不包裹 data 外层。

### 3.4 错误返回

建议采用 HTTP 状态码，并返回统一错误对象（前端当前即使不解析也可兼容）：

{
  "code": "THREAD_NOT_FOUND",
  "message": "thread not found",
  "request_id": "req_xxx"
}

## 4. v1 接口总览（推荐最低集）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | /api/career-agent/threads | 拉取会话列表（左侧导航） |
| GET | /api/career-agent/threads/:threadId/messages | 拉取指定会话消息时间线 |
| GET | /api/career-agent/profile | 拉取结构化画像 |
| PUT | /api/career-agent/profile | 保存画像显式编辑 |
| GET | /api/career-agent/profile/suggestions | 拉取画像建议 |
| GET | /api/career-agent/artifacts | 拉取工件目录 |
| GET | /api/career-agent/artifacts/:artifactId | 拉取单个工件详情 |
| POST | /api/career-agent/artifacts/:artifactId/refresh | 触发工件刷新并返回最新版本 |

## 5. 数据结构（v1）

### 5.1 ThreadSummary

{
  "id": "thread-001",
  "title": "本周规划",
  "preview": "梳理本周重点",
  "status": "active",
  "updated_at": "2026-04-08T09:00:00Z"
}

字段说明：

- status: active | archived
- updated_at 与 updatedAt 二选一均可，建议主推 updated_at

### 5.2 ThreadMessage

{
  "id": "message-001",
  "thread_id": "thread-001",
  "role": "assistant",
  "kind": "markdown",
  "content": "可以打开一个周计划画布",
  "reasoning": "先判断用户目标，再决定输出工件",
  "agent_id": "agent-planner",
  "agent_name": "规划助手",
  "agent_accent": "teal",
  "actions": [
    {
      "id": "action-open-weekly-plan",
      "kind": "open-artifact",
      "label": "打开周计划",
      "artifact_id": "artifact-weekly-plan",
      "view_mode": "pane"
    }
  ],
  "media": [
    {
      "id": "media-001",
      "kind": "image",
      "url": "/mock-media/test_image.png",
      "title": "示例图片"
    }
  ],
  "created_at": "2026-04-08T09:01:00Z"
}

字段说明：

- role: user | assistant | system
- kind: markdown | status（省略时前端按 markdown 处理）
- reasoning 与 think 均可（建议主推 reasoning）
- actions 目前只支持 open-artifact
- media 目前只支持 image/video
- attachments 可作为 media 的兼容别名输入

### 5.3 ProfileRecord

字段与前端结构一致，建议全部提供：

- display_name
- locale
- timezone
- current_role
- employment_status
- experience_summary
- education_summary
- location_region
- target_role
- target_industries
- short_term_goal
- long_term_goal
- weekly_time_budget
- constraints
- work_preferences
- learning_preferences
- key_strengths
- risk_signals
- portfolio_links

说明：前端内部会使用 camelCase，但上游可主推 snake_case。

### 5.4 ProfileSuggestion

{
  "id": "suggestion-target-role",
  "title": "收紧目标角色",
  "rationale": "建议目标更聚焦",
  "source_thread_id": "thread-001",
  "patch": {
    "target_role": "AI 原生前端工程师"
  }
}

### 5.5 ArtifactRecord

{
  "id": "artifact-weekly-plan",
  "type": "weekly-plan",
  "title": "周计划",
  "status": "ready",
  "render_mode": "html",
  "revision": 3,
  "updated_at": "2026-04-08T09:10:00Z",
  "summary": "本周执行安排",
  "payload": {
    "html": "<div>...</div>"
  }
}

字段说明：

- status: idle | loading | streaming | ready | stale | error
- 上游可额外返回 queued/failed，前端会归一化为 loading/error
- render_mode: html | url | markdown | cards
- payload 随 render_mode 变化

## 6. 各接口详细定义

### 6.1 GET /api/career-agent/threads

响应：ThreadSummary[]

### 6.2 GET /api/career-agent/threads/:threadId/messages

路径参数：

- threadId: string

响应：ThreadMessage[]

### 6.3 GET /api/career-agent/profile

响应：ProfileRecord

### 6.4 PUT /api/career-agent/profile

请求体：ProfileRecord

响应：ProfileRecord（保存后的最新值）

### 6.5 GET /api/career-agent/profile/suggestions

响应：ProfileSuggestion[]

### 6.6 GET /api/career-agent/artifacts

响应：ArtifactRecord[]

### 6.7 GET /api/career-agent/artifacts/:artifactId

路径参数：

- artifactId: string

响应：ArtifactRecord

未命中：404

### 6.8 POST /api/career-agent/artifacts/:artifactId/refresh

路径参数：

- artifactId: string

响应：ArtifactRecord（最新 revision）

未命中：404

## 7. 兼容性规则（建议写进联调约定）

1. 命名兼容

- 线程与消息字段兼容 thread_id/threadId、created_at/createdAt
- 动作字段兼容 artifact_id/artifactId、view_mode/viewMode
- 工件字段兼容 render_mode/renderMode、updated_at/updatedAt

2. 动作兼容

- kind 兼容 open-artifact 与 open_artifact
- 非 open-artifact 动作在前端当前版本会被忽略

3. 媒体兼容

- 仅消费 image/video
- URL 建议为相对路径或 http/https
- 非安全 scheme（如 javascript:, data:）不应下发

## 8. 二阶段扩展（暂不纳入 v1 最小集）

以下能力是业务上合理的，但建议在 v1 稳定后再引入：

1. 发送消息

- POST /api/career-agent/threads/:threadId/messages

2. 新建会话

- POST /api/career-agent/threads

3. 删除会话

- DELETE /api/career-agent/threads/:threadId

原因：当前前端发送链路仍处于本地草稿模式，先引入这些接口会导致前后端并发改造与联调复杂度上升。

参考：

- 发送入口现状: [../../src/pages/ConversationWorkspacePage.vue](../../src/pages/ConversationWorkspacePage.vue#L26)
- 本地草稿说明: [../../src/stores/workspace.ts](../../src/stores/workspace.ts#L365)
- 阶段说明: [../frontend-implementation-plan.md](../frontend-implementation-plan.md#L198)

## 9. 实施建议与工作量（审慎估算）

以下为决策级估算，用于控制风险，不作为排期承诺。

### 9.1 推荐推进顺序

1. 冻结合同（0.5 天）

- 确认本文档字段与路径

2. 上游实现 v1 最小集（约 2-5 天）

- 完成 8 个接口
- 优先保证 messages 与 artifacts 正确

3. 前端联调与回归（约 1-3 天）

- 切换 upstream 模式
- 修正字段细节与边界状态

4. 二阶段写操作（约 3-7 天，视需求）

- 新增发送/新建/删除
- 补全 pending/error/retry 与测试

### 9.2 风险控制点

- 不同时改路径体系和数据模型
- 不在 v1 引入双合同并存
- 先确保读取链路稳定，再做写入链路

---

如果团队接受本推荐文档，建议将其作为联调主文档，并把 [../../api.md](../../api.md) 保留为需求背景，不再作为最终接口合同。