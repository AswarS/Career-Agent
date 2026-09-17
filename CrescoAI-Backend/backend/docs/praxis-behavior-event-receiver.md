# Praxis 行为事件回流：本次更新说明与画像证据设计

## 1. 更新目的

Career 已经能够向 Praxis 提供稳定公开身份、权威账号和 Profile V2
完整快照，但此前缺少 Praxis 行为事实的接收端。Praxis 的事务 Outbox 会向
以下地址投递事件：

```http
POST /integration/praxis/v1/behavior-events
```

本次更新补齐可靠接收和幂等确认，同时定义行为事实进入 Career 画像体系前的
证据边界。接收事件不等于修改画像；Profile V2 仍是 Career 唯一权威画像。

## 2. 已实现内容

### 2.1 接收协议

请求必须包含：

```http
Authorization: Bearer <kid>.<service-secret>
X-Trace-Id: <traceId>
Idempotency-Key: <eventId>
Content-Type: application/json
```

- 复用现有 `PraxisServiceAuthGuard`，支持 active/retained 双凭据轮换。
- 仅接受 Praxis 1.12.0 封闭行为契约中的事件类型、资源类型和 facts 字段。
- 严格拒绝额外字段，因此 `rawChat`、`rawAnswer`、`fileBody`、完整画像、
  Prompt、凭据和 Token 等正文或敏感数据不能越过边界。
- `Idempotency-Key` 必须等于 `eventId`。
- `X-Trace-Id` 必须等于事件正文的 `traceId`。
- `externalUserId` 必须是 Career 已存在用户的不可变公开 UUID。
- 时间、UUID、Hash、状态 token、整数范围、资源数量和资源唯一性均会校验。

首次接收返回 HTTP 202：

```json
{
  "eventId": "pbe_example",
  "status": "accepted",
  "traceId": "trace_example"
}
```

相同事件重试返回 HTTP 202 和 `duplicate`。同一 `eventId` 携带不同规范化内容
时返回 HTTP 409，避免幂等键被复用于不同业务事实。

### 2.2 Inbox 存储

新增 `praxis_behavior_events` 表和迁移
`1785128065000-PraxisBehaviorEvents`。每个事件保存：

- Career 内部用户映射；
- 契约版本、事件类型、Actor、结果和发生时间；
- Trace ID 与可选源事件 ID；
- 最小化的资源引用和 facts；
- RFC 8785 规范化事件 JSON 及 SHA-256 Hash；
- 画像证据分类决定及原因；
- Career 接收时间。

`eventId` 是主键。写入和用户映射在同一事务内完成；并发重复投递依靠数据库
唯一约束收口，然后按已存 Hash 返回 `duplicate` 或 409。

数据库迁移后才可启动应用：

```sh
bun run network:migrate
bun run network:start
```

## 3. 画像证据设计

### 3.1 基本原则

Praxis 行为事件是已经发生的领域事实，但并不天然等于 Career 画像事实。例如：

- `node.pass` 证明某个 Praxis 节点已通过，但事件没有提供可公开的技能名称；
- `evaluation.complete` 可以携带分数，但分数不足以证明稳定能力；
- `certificate.issue` 证明产生了证书，但事件没有提供可写入画像的证书名称；
- 失败、拒绝或需要修订不能推导用户“不具备某能力”；
- 登录、文件读写和缓存读取没有职业画像价值。

因此，本次版本只产生两类处置：

| 处置 | 含义 | 是否修改 Profile V2 |
| --- | --- | --- |
| `audit_only` | 保留最小事实用于审计、幂等和后续统计 | 否 |
| `profile_review_signal` | 可能与画像有关，但必须经过有依据的复核 | 否 |

### 3.2 当前 review signal 白名单

只有结果为 `accepted` 或 `succeeded` 的下列事件会形成复核信号：

| 事件 | 证据类别 | 可证明的最小事实 | 当前禁止推导 |
| --- | --- | --- | --- |
| `profile.complete` | `profile_completion` | Praxis 五维实训画像已完成 | 具体职业偏好或能力 |
| `run.complete` | `training_progress` | 一次实训 Run 已完成 | 已掌握 Run 涉及的全部技能 |
| `node.pass` | `learning_progress` | 一个训练节点已通过 | 未命名技能、长期能力水平 |
| `evaluation.complete` | `assessment_result` | 一次评估已完成 | 单次分数等于稳定能力 |
| `final_assessment.complete` | `assessment_result` | 最终评估已完成 | 自动写入能力标签 |
| `certificate.issue` | `credential_achievement` | 证书已签发 | 未提供名称的证书条目 |
| `certificate.publish` | `credential_achievement` | 证书已发布 | 公开范围或职业资质推断 |

失败或拒绝结果一律为 `audit_only`。未列入白名单的事件也一律为
`audit_only`。这是默认拒绝策略，新事件类型不会自动获得画像写入能力。

### 3.3 后续从信号到 Profile V2 的条件

后续版本如需让信号影响画像，必须另行实现异步证据处理器，并满足：

1. 获得可公开、可解释的人类可读事实，不能仅依赖 Praxis 内部资源 ID。
2. 把 Praxis 行为证据作为独立来源，不伪装成 Career Conversation Evidence。
3. 对候选事实执行去重、时效、冲突和 L0–L3 策略判断。
4. 新增或验证低风险事实时仍写 Profile Revision。
5. 替换、删除、硬约束和基础事实变更必须生成 Proposal 或要求用户确认。
6. 只有 Profile V2 实际改变时才递增 `aggregateVersion`。
7. 不允许 Praxis 直接提交 Profile patch；画像派生权始终属于 Career。

当前代码没有自动启动 Profile Refresh Job，也没有根据事件直接调用
Profile Mutation Service。这是有意的安全边界，不是遗漏。

## 4. 双方数据职责

```text
Career Profile V2（权威职业画像）
        ↓ 完整快照
Praxis 操作级快照 + 五维实训画像
        ↓ 封闭、最小行为事实
Career Praxis Behavior Inbox
        ↓ 仅标记复核信号
未来的 Career 证据处理与用户确认
        ↓
Career Profile V2 新版本
```

Praxis 的 Project、Run、Node、Skill 等对象仍归 Praxis 所有。Career 只保存契约
允许的类型化引用，不查询、不复制这些对象，也不把它们变成 Career 内部模型。

## 5. 测试与工程门禁

新增测试覆盖：

- 合法事件首次接收和证据分类；
- 完全相同的重复事件；
- 同一事件 ID 的内容冲突；
- Idempotency-Key 和 Trace ID 不匹配；
- 额外/敏感字段拒绝；
- 失败事件与非画像事件保持 audit-only；
- 真实 Nest HTTP 路由、service credential、202 accepted/duplicate；
- 完整生产迁移序列包含新 Inbox 表。

GitHub Actions 已加入新测试和新增 Network 文件的定向 TypeScript 检查。

## 6. 本次不包含的内容

- 不修改 Praxis 的事件 Schema 或 Outbox。
- 不接收原始回答、聊天、文件正文或完整 Praxis 画像。
- 不自动把分数、完成状态、节点或证书写入 Profile Memory。
- 不提供人工处理 review signal 的管理页面。
- 不改变 Career 向 Praxis 发布账号状态事件的现有 Outbox。
- 不改变 Profile V2 快照格式、版本或 Hash 规则。
