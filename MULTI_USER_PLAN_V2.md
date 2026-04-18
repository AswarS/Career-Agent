# Claude Code 多用户 HTTP API 服务实现计划

## 1. 项目目标

在保留现有单用户 CLI 模式的前提下，新增 HTTP/WebSocket 服务器模式，支持多用户同时使用。每个用户传入自己的 `apiKey` 和 `baseUrl`，服务端为每个用户创建完全隔离的 Anthropic 客户端、会话状态、工作目录和对话历史。

**核心原则**：
- CLI 模式零改动，完全兼容
- 服务模式作为新增入口，通过 `http-serve` 子命令启动（不能用 `serve`，因为 `main.tsx:3906` 已有 `mcp.command('serve')`）
- 用户之间完全隔离（API 客户端、对话历史、工作目录、状态、MCP 连接）

---

## 2. 容量规划

**方案 A（推荐）：进程内多会话 ALS 模式** — 所有用户共享一个 Bun 进程，通过 `AsyncLocalStorage` 隔离。

| 资源 | 单会话消耗 | 最大并发（4C16G） |
|------|-----------|---------|
| 内存（空闲） | ~8 MB | ~1500 |
| 内存（活跃） | ~20 MB | ~600 |

方案 B（每用户独立进程）每进程 ~200MB，仅支持 ~70 并发。结论：选 A，上限 100 个中度用户。

---

## 3. 核心架构

```
客户端 A (apiKey: sk-xxx, baseUrl: https://api.anthropic.com)
    |
    v  HTTP/WS
+--------------------------------------------------+
|  Claude Code Server (单进程, Bun.serve)            |
|                                                    |
|  SessionContext_A          SessionContext_B         |
|  +-------------------+    +-------------------+    |
|  | STATE (独立副本)   |    | STATE (独立副本)   |    |
|  | Anthropic Client  |    | Anthropic Client  |    |
|  | QueryEngine       |    | QueryEngine       |    |
|  | cwd: /ws/userA    |    | cwd: /ws/userB    |    |
|  | MCP Connections   |    | MCP Connections   |    |
|  +-------------------+    +-------------------+    |
|         ↑                          ↑               |
|         |  AsyncLocalStorage.run()  |               |
|         +----------+---------------+               |
|              请求路由层                              |
+--------------------------------------------------+
```

请求流程：解析 sessionId → 获取 SessionContext → `AsyncLocalStorage.run(ctx, () => queryEngine.submitMessage(...))` → SSE/WS 推送响应。

---

## 4. 实施计划（按批次）

### 4.1 关键数据规模

| 指标 | 实际值 |
|------|--------|
| state.ts 导出函数 | **210 个**（约 100-120 个访问 STATE，需修改） |
| 导入 state.ts 的文件 | **260 个** |
| React/Ink 相关文件 | 731 文件（均为 UI 组件，服务模式不加载） |

### 4.2 第 1 批：核心隔离层 🔧 进行中

> 所有后续批次的前提。

#### 1a. 导出 `createIsolatedState` ✅

```typescript
// src/bootstrap/state.ts — 添加工厂函数
export function createIsolatedState(overrides: Partial<State> = {}): State {
  const state = getInitialState()
  return { ...state, ...overrides }
}
```

#### 1b. 模块级变量移入 STATE ✅

以下变量被所有会话共享，必须移入 STATE：

```
state.ts:666  interactionTimeDirty: boolean
state.ts:724  outputTokensAtTurnStart: number
state.ts:725  currentTurnTokenBudget: number | null
state.ts:732  budgetContinuationCount: number
state.ts:792  scrollDraining: boolean        // 服务模式下忽略
state.ts:793  scrollDrainTimer
```

#### 1c. `sessionSwitched` Signal 移入 SessionContext ⬜ 未完成

`state.ts:481` 的 `sessionSwitched = createSignal()` 是模块级单例，`emit()` 会广播给所有会话。移入 SessionContext 中 per-session 管理。

#### 1d. 新建 `src/server/SessionContext.ts` ✅

> 已实现：`getSessionContext()` / `runWithSessionContext()` / `isServerMode()`
> 文件位置：`backend/src/server/SessionContext.ts`

#### 1e. 修改 `state.ts` — 全部函数 ALS 检查 ⬜ 未完成

对所有约 100-120 个访问 `STATE.xxx` 的 getter/setter 添加：

```typescript
import { getSessionContext } from '../server/SessionContext.js'

export function getSessionId(): SessionId {
  const ctx = getSessionContext()
  if (ctx) return ctx.state.sessionId
  return STATE.sessionId
}
```

**排除**：OTel getter 保持全局（用 sessionId attribute 区分）；纯工具函数不改；`resetStateForTests()` 服务模式下 guard。

**建议**：用 jscodeshift AST 工具自动注入。

#### 1f. `src/utils/cwd.ts` 无需修改（1e 完成后生效）

链路 `pwd()` → `getCwdState()` → `STATE.cwd` 在 1e 后自动路由到 per-session。

---

### 4.3 第 2 批：服务器骨架

#### 2a. 新建 `src/server/index.ts`（Bun.serve）

> 使用 `Bun.serve()`，与现有 `directConnectManager.ts` 一致，无需 `ws` npm 包。

```typescript
export async function startServer(rawConfig: Partial<ServerConfig>): Promise<void> {
  const config = parseServerConfig(rawConfig)
  const sessionManager = new SessionManager(config)
  const router = createRouter(sessionManager, config)

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch(req, server) {
      const url = new URL(req.url)
      if (url.pathname.match(/^\/v1\/sessions\/[a-f0-9-]+\/ws$/)) {
        const sessionId = url.pathname.split('/')[3]
        return server.upgrade(req, { data: { sessionId, token: url.searchParams.get('token') } })
          ? undefined : new Response('Upgrade failed', { status: 500 })
      }
      return router.handleRequest(req)
    },
    websocket: {
      open(ws) { sessionManager.handleWebSocketConnection(ws, ws.data.sessionId, ws.data.token) },
      message(ws, msg) { sessionManager.handleWebSocketMessage(ws, msg) },
      close(ws) { sessionManager.handleWebSocketClose(ws) },
    },
  })

  console.log(`[Server] Listening on ${config.host}:${config.port}`)
  process.on('SIGINT', () => {
    sessionManager.destroyAllSessions().then(() => { server.stop(); process.exit(0) })
  })
}
```

#### 2b. 修改 `src/main.tsx`

在 Commander 注册区（~3900 行）添加 `http-serve` 子命令（~15 行）。

#### 2c. 扩展 `src/server/types.ts` + 新建 `src/server/config.ts`

扩展现有 `ServerConfig` 类型（添加 `sessionTimeoutMs`、`defaultWorkspace`），`config.ts` 放 `parseServerConfig` 函数。

#### 2d. 修改 `package.json`

添加 `"http-serve": "bun run --env-file=.env src/main.tsx http-serve"`。

---

### 4.4 第 3 批：会话管理 + API 客户端

> **完成第 3 批 + 第 4 批 4a 后可进行初步测试。**

#### 3a. 新建 `src/server/SessionManager.ts`

- `createSession(opts)` — 创建独立 STATE 副本 + QueryEngine
- `destroySession(id)` — 中止查询 + 关闭 MCP/WS + 清理引用
- `destroyAllSessions()` — 批量清理
- `startIdleSweeper()` — 每 60s 检查超时会话

#### 3b. 修改 `src/services/api/client.ts`

检测到 ALS 上下文时，直接用 session 的 apiKey/baseUrl 创建 Anthropic 客户端，跳过 OAuth 全局认证。

#### 3c. 新建 `src/server/permissions.ts`

CLI 权限系统依赖交互式对话框，服务模式需替代方案：

```typescript
export type ServerPermissionMode = 'allow_all' | 'deny_dangerous' | 'allow_read_only' | 'explicit'
```

V1 默认 `allow_all`。`explicit` 模式（WS 实时确认）留 V2。

---

### 4.5 第 4 批：API 端点 + 可用性

#### 4a. 新建 `src/server/router.ts` ★ 初步测试节点 ★

> 完成 4a 后可通过 curl 创建多个会话、各自发消息、验证独立对话。

REST 端点：

| 方法 | 路径 | 功能 |
|------|------|------|
| `POST` | `/v1/sessions` | 创建会话 |
| `GET` | `/v1/sessions` | 列出会话 |
| `GET` | `/v1/sessions/:id` | 会话信息 |
| `DELETE` | `/v1/sessions/:id` | 销毁会话 |
| `POST` | `/v1/sessions/:id/message` | SSE 流式消息 |
| `GET` | `/v1/health` | 健康检查 |

#### 4b. 新建 `src/server/wsHandler.ts`

WebSocket 双向协议：`user_message` / `interrupt` / `permission_response`。

#### 4c. `isHeadless` 标记 + Ink 解耦

服务模式下跳过 Ink render，直接 immediate flush。

#### 4d. 新建 `filesystemIsolation.ts` + `cleanup.ts`

路径穿越防护 + 资源清理工具。

---

### 4.6 第 5 批：后续迭代（V2）

- 会话持久化与恢复（`server-sessions.json`）
- explicit 权限模式（WS 实时确认）
- CORS 白名单
- `process.cwd()` 全面替换

---

### 4.7 里程碑

```
第 1 批 → M1: 可创建多个独立 STATE 上下文 ✅ 已完成
第 2 批 → M2: 可启动服务器
第 3 批 → M3: 可在内存中为多用户创建完整会话
第 3 批 + 4a → ★ 初步测试：curl 创建多会话（不同 apiKey/baseUrl），各自发消息
第 4 批 → M4: 完整 HTTP/WS API
第 5 批 → M5: 生产就绪
```

---

## 5. 文件清单

### 新建 9 个

| 文件 | 批次 | 用途 |
|------|------|------|
| `src/server/SessionContext.ts` | 1 | ALS 容器 |
| `src/server/index.ts` | 2 | Bun.serve 入口 |
| `src/server/config.ts` | 2 | 配置解析 |
| `src/server/SessionManager.ts` | 3 | 会话管理 |
| `src/server/permissions.ts` | 3 | 权限模型 |
| `src/server/router.ts` | 4 | REST API |
| `src/server/wsHandler.ts` | 4 | WS 协议 |
| `src/server/filesystemIsolation.ts` | 4 | 路径隔离 |
| `src/server/cleanup.ts` | 4 | 资源清理 |

### 修改 5 个

| 文件 | 批次 | 改动 |
|------|------|------|
| `src/bootstrap/state.ts` | 1 | ~100-120 函数 ALS + createIsolatedState + 模块变量移入 STATE + sessionSwitched 隔离 |
| `src/services/api/client.ts` | 3 | 服务模式快速路径 (~60 行) |
| `src/main.tsx` | 2 | http-serve 子命令 (~15 行) |
| `src/server/types.ts` | 2 | 扩展 ServerConfig (~10 行) |
| `package.json` | 2 | http-serve 脚本 |

### 参考文件（不改）

`src/utils/teammateContext.ts` / `agentContext.ts` — ALS 模式参考
`src/utils/cwd.ts` — 第 1 批后无需修改
`src/server/directConnectManager.ts` — Bun WebSocket 客户端参考

---

## 6. 风险与缓解

| 风险 | 等级 | 批次 | 缓解 |
|------|------|------|------|
| 210 函数遗漏修改 | **高** | 1 | jscodeshift AST 自动化 |
| 模块级变量跨会话污染 | **高** | 1 | 移入 STATE |
| sessionSwitched 跨会话广播 | **高** | 1 | 移入 SessionContext |
| 权限对话框卡死 | **高** | 3 | allow_all 默认 |
| OTel 重复创建 | **中** | 1 | 全局单例 + sessionId attribute |
| Ink 渲染依赖 | **中** | 4 | isHeadless |
| ALS 上下文丢失 | **中** | 1 | 降级逻辑 + strictMode |
| 文件路径穿越 | **中** | 4 | filesystemIsolation |
| 内存泄漏 | **低** | 3 | compaction + 超时回收 |

---

## 7. 测试策略

**第 1 批验收**：两个会话设置不同 outputTokensAtTurnStart，验证互不影响。

**第 3+4a 验收（初步测试）**：
```bash
# 创建两个不同凭据的会话
curl -X POST http://localhost:8080/v1/sessions -d '{"apiKey":"sk-a","baseUrl":"https://api.a.com"}'
curl -X POST http://localhost:8080/v1/sessions -d '{"apiKey":"sk-b","baseUrl":"https://api.b.com"}'

# 各自发消息验证独立
curl -X POST http://localhost:8080/v1/sessions/<idA>/message -d '{"content":"Hello"}'
curl -X POST http://localhost:8080/v1/sessions/<idB>/message -d '{"content":"Hello"}'
```

**CLI 兼容性**：不使用 http-serve，验证现有功能正常。

---

## 8. 使用示例

```bash
# 启动
bun run http-serve --port 9090 --auth-token secret

# 创建会话
curl -X POST http://localhost:9090/v1/sessions \
  -H "Authorization: Bearer secret" \
  -d '{"apiKey":"sk-ant-xxx","baseUrl":"https://api.anthropic.com"}'

# 发消息
curl -X POST http://localhost:9090/v1/sessions/<id>/message \
  -H "Authorization: Bearer secret" \
  -d '{"content":"Hello"}'

# WS
new WebSocket('ws://localhost:9090/v1/sessions/<id>/ws?token=secret')

# 销毁
curl -X DELETE http://localhost:9090/v1/sessions/<id> -H "Authorization: Bearer secret"
```

| 环境变量 | 默认值 |
|---------|--------|
| `CLAUDE_SERVER_PORT` | 8080 |
| `CLAUDE_SERVER_HOST` | 0.0.0.0 |
| `CLAUDE_SERVER_MAX_SESSIONS` | 100 |
| `CLAUDE_SERVER_TIMEOUT_MS` | 1800000 |
| `CLAUDE_SERVER_AUTH_TOKEN` | 无 |
| `CLAUDE_SERVER_WORKSPACE` | 当前目录 |

---

## 9. 实际进度追踪（User-Separate 分支）

> 最后更新：2026-04-17

### 分支结构

```
User-Separate 分支 (career-agent/User-Separate)
  backend/
    src/          ← 源代码（对应 main 分支的 src/）
    shims/        ← shim 模块
    vendor/       ← 第三方
  backend/package.json
  backend/tsconfig.json
  tests/          ← 测试文件（根目录级别）
```

### 第 1 批：核心隔离层 ✅ 已完成

| 子项 | 状态 | 说明 |
|------|------|------|
| 1a. `createIsolatedState` | ✅ 已完成 | `backend/src/bootstrap/state.ts` — 工厂函数，创建独立 STATE 副本 |
| 1b. 模块变量移入 STATE | ✅ 已完成 | `interactionTimeDirty` / `outputTokensAtTurnStart` / `currentTurnTokenBudget` / `budgetContinuationCount` 已移入 State 类型 |
| 1c. `sessionSwitched` Signal | ✅ 已完成 | `switchSession()` / `onSessionSwitch()` 已实现 ALS 路由，per-session signal |
| 1d. `SessionContext.ts` | ✅ 已完成 | `backend/src/server/SessionContext.ts`，77 行，含 `getSessionContext` / `runWithSessionContext` / `isServerMode` |
| 1e. state.ts ALS 路由 | ✅ 已完成 | `getState()` helper + 所有 ~100+ accessor 函数已替换 STATE. → getState(). |
| 1f. `cwd.ts` 无需改 | ✅ 无需修改 | 链路 `pwd()` → `getCwdState()` → 自动路由 per-session |
| 测试 | ✅ 已完成 | `backend/tests/batch1-isolation.test.ts` — 28 tests, 53 assertions, 全部通过 |

### 第 2 批：服务器骨架 ✅ 已完成

| 子项 | 状态 | 说明 |
|------|------|------|
| 2a. `backend/src/server/index.ts` | ✅ 已完成 | Bun.serve 入口，含 WS upgrade、graceful shutdown |
| 2b. `backend/src/main.tsx` http-serve 子命令 | ✅ 已完成 | Commander 注册，CLI 选项解析 |
| 2c. `backend/src/server/config.ts` | ✅ 已完成 | parseServerConfig，CLI/env/default 优先级 |
| 2d. `backend/package.json` http-serve 脚本 | ✅ 已完成 | 基于 main 分支创建，路径适配 backend/ 结构 |

### 第 3 批：会话管理 + API 客户端 ✅ 已完成

| 子项 | 状态 | 说明 |
|------|------|------|
| 3a. `backend/src/server/SessionManager.ts` | ✅ 已完成 | 16 tests, 35 assertions |
| 3b. `backend/src/services/api/client.ts` 服务模式 | ✅ 已完成 | ALS 检测 → session apiKey/baseUrl 快速路径 |
| 3c. `backend/src/server/permissions.ts` | ✅ 已完成 | checkToolPermission，4 种模式 |

### 第 4 批：API 端点 + 可用性 ✅ 已完成

| 子项 | 状态 | 说明 |
|------|------|------|
| 4a. `backend/src/server/router.ts` | ✅ 已完成 | REST API: health/sessions/message (SSE) |
| 4b. `backend/src/server/wsHandler.ts` | ✅ 已完成 | ping/user_message/interrupt 协议 |
| 4c. `isHeadless` 标记 + Ink 解耦 | ✅ 已完成 | getIsHeadless() 已通过 getState() ALS 路由 |
| 4d. `backend/src/server/filesystemIsolation.ts` | ✅ 已完成 | validatePath 路径穿越防护 |
| 4e. `backend/src/server/cleanup.ts` | ✅ 已完成 | WS/MCP/AbortController 资源清理 |

### ALS 路由修复（2026-04-18）

| 修复项 | 状态 | 说明 |
|------|------|------|
| `getIsHeadless()` ALS 路由 | ✅ 已修复 | `STATE.isInteractive` → `getState().isInteractive` |
| `regenerateSessionId()` ALS 路由 | ✅ 已修复 | `STATE.*` → `getState().*` |
| `SessionContext.ts` 填充 | ✅ 已修复 | Git 中的空文件已填充为完整实现（65 行） |
| 测试 | ✅ 已完成 | `batch2-als-fixes.test.ts` — 12 tests, 31 assertions |

### 已有文件（User-Separate 分支）

```
backend/src/server/
  ├── SessionContext.ts          ✅ ALS 容器 (65 行)
  ├── SessionManager.ts          ✅ 会话管理 (216 行)
  ├── config.ts                  ✅ 配置解析 (51 行)
  ├── permissions.ts             ✅ 权限模型 (85 行)
  ├── router.ts                  ✅ REST API (159 行)
  ├── wsHandler.ts               ✅ WS 协议 (83 行)
  ├── filesystemIsolation.ts     ✅ 路径隔离
  ├── cleanup.ts                 ✅ 资源清理
  ├── index.ts                   ✅ Bun.serve 入口 (68 行)
  ├── createDirectConnectSession.ts  (已有，不改)
  ├── directConnectManager.ts        (已有，不改)
  └── types.ts                       (已有，已扩展)

backend/src/bootstrap/
  └── state.ts                   ✅ ALS 路由完成，所有 accessor 使用 getState()

backend/tests/
  ├── batch1-isolation.test.ts   ✅ 28 tests, 53 assertions
  ├── batch2-als-fixes.test.ts   ✅ 12 tests, 31 assertions
  ├── session-manager.test.ts    ✅ 16 tests, 35 assertions
  ├── server-api.test.ts         ✅
  ├── server-integration.test.ts ✅
  └── server-utilities.test.ts   ✅

backend/package.json             ✅ 新建，含 http-serve 脚本
backend/tsconfig.json            ✅ 新建，含 src/* 路径别名
```

### 下一步行动（第 5-8 批：完整功能实现）

---

## 10. 完整功能补全计划（第 5-8 批）

> 目标：每个用户会话拥有与 CLI 模式完全相同的 Claude Code 功能，包括 LLM 对话、工具调用、对话持久化、会话恢复。

### 10.1 关键架构认知

**原始 Claude Code 对话链路**：
```
用户输入 → REPL.tsx (Ink UI)
  → ask() / QueryEngine.submitMessage()
    → 构建 system prompt + 工具列表 + 对话历史
    → Anthropic API 流式调用
    → 工具调用 → 权限检查 → 工具执行 → 结果回传
    → recordTranscript() 写入 JSONL
```

**服务模式对应链路**：
```
HTTP POST /message → router.ts
  → runWithSessionContext(ctx, () => queryEngine.submitMessage(content))
    → (ALS 自动路由所有 state 访问到 per-session STATE)
    → Anthropic API 流式调用 → SSE 推送
    → 工具调用 → serverPermission 检查 → 工具执行 → 结果回传
    → recordTranscript() 写入 per-session JSONL（已通过 ALS 隔离）
```

**核心发现**：
- `QueryEngine` 是自包含的，不依赖 Ink UI，构造函数接收 `QueryEngineConfig` 即可独立运行
- `QueryEngine.submitMessage()` 返回 `AsyncGenerator<SDKMessage>`，天然适合 SSE 流式输出
- 对话持久化通过 `recordTranscript()` / `getTranscriptPath()` 实现，后者依赖 `getSessionId()` + `getOriginalCwd()`，已通过 ALS 路由到 per-session STATE
- 工具系统通过 `getTools(toolPermissionContext)` 获取，每个会话可独立实例化

### 10.2 第 5 批：QueryEngine 集成 — 真实 LLM 对话

> **完成后可验收**：多用户各自与 LLM 对话，互不干扰。

#### 5a. 修复 `process.cwd()` → `pwd()` 全部关键位置（从第 8 批提前）

工具执行链路中多处直接调用 `process.cwd()`，服务模式下返回服务器目录而非用户 cwd。
必须在此批修复，否则 Read/Bash/Edit 等工具全部会操作错误目录。

关键修复文件：
- `src/utils/fsOperations.ts` — 文件操作核心，直接返回 `process.cwd()`
- `src/utils/shell/bashProvider.ts` — Shell 执行
- 其他共约 8 处

#### 5b. 新建 `src/server/toolPermissionContext.ts`

服务模式的工具权限上下文，替代 CLI 的交互式权限对话框。

#### 5c. 新建 `src/server/appStateFactory.ts`

Per-session 最小化 AppState，避免 React/Ink 依赖。

#### 5d. 新建 `src/server/queryEngineFactory.ts`

为每个会话创建独立的 `QueryEngine` 实例。

```typescript
// 核心接口
export function createQueryEngineForSession(
  context: SessionContext,
): QueryEngine

// 关键依赖：
// - QueryEngineConfig 组装
// - tools: getTools(serverToolPermissionContext)
// - commands: getServerCommands() (服务模式下有限的命令集)
// - mcpClients: 空 [] (V1 不支持 MCP，V2 按需加载)
// - canUseTool: 基于 permissions.ts 的 checkToolPermission
// - getAppState / setAppState: per-session 简化版 AppState
// - readFileCache: per-session 新建
// - abortController: 来自 context
```

**实现要点**：
1. `canUseTool` 回调：调用 `checkToolPermission(toolName, context.config.permissions)` 决定是否允许
2. `getAppState` / `setAppState`：创建 per-session 的简化 AppState，仅包含 `toolPermissionContext` 和 `verbose` 等必要字段
3. `userSpecifiedModel`：从 `context.config.model` 读取
4. `cwd`：从 `context.config.cwd` 读取

#### 5e. 修改 `src/server/SessionManager.ts`

在 `createSession()` 中：
- 调用 `createQueryEngineForSession(context)` 创建 QueryEngine
- 将 `context.queryEngine` 设为创建的实例

在 `destroySession()` 中：
- 调用 `context.abortController.abort()` 中止正在进行的查询

#### 5f. 修改 `src/server/router.ts`

替换 POST `/v1/sessions/:id/message` 的 echo 模式：

```typescript
// 旧: send('assistant', { content: `[Echo] You said: ${content}`, sessionId })
// 新:
for await (const msg of session.context.queryEngine.submitMessage(content)) {
  send(msg.type, { ...msg, sessionId })
}
```

SSE 事件类型映射：
| SDKMessage.type | SSE event | 说明 |
|----------------|-----------|------|
| `assistant` | `assistant` | LLM 文本回复 |
| `tool_use` | `tool_use` | 工具调用请求 |
| `tool_result` | `tool_result` | 工具执行结果 |
| `thinking` | `thinking` | 思考过程 |
| `system` | `system` | 系统消息 |

#### 5g. 修改 `src/services/api/client.ts`

服务模式快速路径已实现（3b）。确认在 QueryEngine 创建的 API 调用链路中能正确使用 session 的 `apiKey`/`baseUrl`。

#### 5h. 测试

- 创建两个不同 apiKey 的会话
- 各自发送消息，验证 LLM 响应独立
- 验证工具调用正常（如 `Read` 工具读取不同 cwd 的文件）

---

### 10.3 第 6 批：对话持久化与会话恢复

> **完成后可验收**：用户关闭浏览器后重新连接，可以继续之前的对话。

#### 6a. 对话持久化（自动生效）

`recordTranscript()` 在 `QueryEngine.submitMessage()` 内部自动调用。关键路径：

```
recordTranscript()
  → getTranscriptPath()
    → getSessionProjectDir() ?? getProjectDir(getOriginalCwd())
    → join(projectDir, `${getSessionId()}.jsonl`)
```

所有函数已通过 ALS 路由到 per-session STATE，所以：
- `getSessionId()` → `ctx.state.sessionId`（每个会话唯一 UUID）
- `getOriginalCwd()` → `ctx.state.originalCwd`（每个会话的工作目录）

**存储路径**：`~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl`

**无需额外代码**，持久化应自动工作。但需验证：
1. 多会话写入不同 JSONL 文件
2. 文件内容互不干扰
3. JSONL 格式与 CLI 模式一致

#### 6b. 会话恢复 — 新增 API 端点

```
POST /v1/sessions/:id/resume   — 恢复之前的会话上下文
POST /v1/sessions              — 支持 resumeFrom 参数
```

实现：
1. 读取 `<sessionId>.jsonl` 文件
2. 使用 `buildConversationChain()` 或 `loadConversationForResume()` 加载历史消息
3. 重建 `QueryEngine` 并传入 `initialMessages`

#### 6c. 会话列表 — 新增 API 端点

```
GET /v1/sessions/history       — 列出用户的历史会话（从 JSONL 文件扫描）
```

实现：
1. 扫描 `~/.claude/projects/<user-cwd>/` 下的 JSONL 文件
2. 读取每个文件的 metadata（标题、时间、标签）
3. 返回列表供前端选择恢复

#### 6d. 测试

- 创建会话，发送消息，验证 JSONL 文件生成
- 销毁内存中的会话，通过 resume 恢复
- 验证恢复后对话历史完整

---

### 10.4 第 7 批：MCP 连接与完整工具支持

> **完成后可验收**：每个用户可以使用 MCP 工具和完整的工具集。

#### 7a. Per-session MCP 连接

每个会话可以有独立的 MCP 服务器配置：

```typescript
// 扩展 CreateSessionOptions
type CreateSessionOptions = {
  // ...existing fields...
  mcpServers?: Record<string, {
    command: string
    args?: string[]
    env?: Record<string, string>
  }>
}
```

实现：
1. 在 `createQueryEngineForSession` 中，根据 session 的 `mcpServers` 配置启动 MCP 进程
2. 将连接的 `MCPServerConnection[]` 传入 QueryEngine
3. 在 `destroySession` 时关闭所有 MCP 连接

#### 7b. 完整工具集

当前 `getTools()` 返回的工具包括：
- 文件操作：Read, Edit, Write, Glob, Grep
- 执行：Bash, PowerShell
- 搜索：WebSearch, WebFetch
- 任务：TodoRead, TodoWrite
- LSP：LSP 工具
- 其他：NotebookEdit, Task, Agent 等

服务模式下需：
1. 保留所有安全工具（Read, Glob, Grep 等）
2. 根据权限模式（permissions.ts）控制危险工具
3. 工具的工作目录绑定到 session 的 `cwd`，通过 ALS 自动路由

#### 7c. 测试

- 创建会话并配置 MCP 服务器
- 验证 MCP 工具可用
- 验证工具执行在正确的 cwd 下

---

### 10.5 第 8 批：生产加固

> **完成后可验收**：系统可安全部署到生产环境。

#### 8a. CORS 白名单

```typescript
// config.ts 扩展
type ServerConfig = {
  // ...existing fields...
  corsOrigins?: string[]  // 默认 ['*']，生产应限制
}
```

#### 8b. 速率限制

```typescript
// 每用户请求速率限制
import rateLimit from 'express-rate-limit'
// 或使用 Bun 原生实现
```

#### 8c. `process.cwd()` 全面替换

排查所有 `process.cwd()` 调用，确保在 ALS 上下文中使用 `getCwdState()` 代替。已知的 ALS 路由覆盖了 `state.ts` 中的访问器，但工具执行代码中可能还有直接调用。

#### 8d. Explicit 权限模式（WS 实时确认）

```typescript
// wsHandler.ts 扩展
type WsMessage =
  | { type: 'user_message', content: string }
  | { type: 'interrupt' }
  | { type: 'permission_response', requestId: string, allowed: boolean }
```

当权限模式为 `explicit` 时：
1. 工具调用暂停，通过 WS 推送 `permission_request`
2. 客户端回复 `permission_response`
3. 服务端继续或中止工具执行

#### 8e. 资源限制

- 每会话内存监控
- 对话长度限制（超过阈值触发 compaction）
- 单次请求超时
- 总 token 预算限制

#### 8f. 监控与日志

- 结构化日志（JSON 格式）
- 请求级别 tracing（含 sessionId）
- Prometheus 指标（请求数、延迟、token 使用量）

---

### 10.6 实施顺序与依赖关系

```
第 5 批（QueryEngine 集成）
  ├── 5a. queryEngineFactory.ts    ← 核心文件，无依赖
  ├── 5b. SessionManager 集成      ← 依赖 5a
  ├── 5c. router.ts 真实流式       ← 依赖 5b
  ├── 5d. client.ts 验证           ← 依赖 5c
  └── 5e. 测试                     ← 依赖全部

第 6 批（持久化与恢复）           ← 依赖第 5 批
  ├── 6a. 持久化验证（可能零代码）
  ├── 6b. resume API 端点
  ├── 6c. history API 端点
  └── 6d. 测试

第 7 批（MCP + 完整工具）         ← 依赖第 5 批
  ├── 7a. Per-session MCP
  ├── 7b. 完整工具集
  └── 7c. 测试

第 8 批（生产加固）               ← 依赖第 5-7 批
  ├── 8a. CORS
  ├── 8b. 速率限制
  ├── 8c. process.cwd() 替换
  ├── 8d. Explicit 权限
  ├── 8e. 资源限制
  └── 8f. 监控日志
```

### 10.7 新建/修改文件清单

#### 新建文件（第 5-8 批）

| 文件 | 批次 | 用途 |
|------|------|------|
| `src/server/queryEngineFactory.ts` | 5 | QueryEngine 实例化工厂 |
| `src/server/appStateFactory.ts` | 5 | Per-session AppState 创建 |
| `src/server/toolPermissionContext.ts` | 5 | 服务模式工具权限上下文 |
| `src/server/sessionResume.ts` | 6 | 会话恢复逻辑 |

#### 修改文件（第 5-8 批）

| 文件 | 批次 | 改动 |
|------|------|------|
| `src/server/SessionManager.ts` | 5 | 创建 QueryEngine 实例 |
| `src/server/router.ts` | 5 | 真实 LLM 流式响应替代 echo |
| `src/server/SessionContext.ts` | 6 | 可能扩展持久化相关字段 |
| `src/server/config.ts` | 8 | CORS、速率限制配置 |
| `src/server/wsHandler.ts` | 8 | explicit 权限模式 |
| `src/server/index.ts` | 8 | CORS 中间件、监控 |

### 10.8 风险与缓解

| 风险 | 等级 | 批次 | 缓解 |
|------|------|------|------|
| QueryEngine 内部依赖未通过 ALS 路由的全局变量 | **高** | 5 | 逐函数排查，特别是 `query.ts` 内部 |
| `getAppState()` 返回的 React/Ink 状态在服务模式下不兼容 | **高** | 5 | 创建服务模式专用最小 AppState |
| 工具执行中使用 `process.cwd()` 而非 `getCwdState()` | **中** | 5-8 | ALS 路由已覆盖 state.ts 访问器，但工具内部代码需逐一检查 |
| JSONL 文件路径冲突（不同用户同一 cwd） | **中** | 6 | sessionId 唯一，路径天然隔离；但需验证 `getProjectDir()` 不依赖全局状态 |
| MCP 连接资源泄漏 | **中** | 7 | destroySession 中清理，cleanup.ts 已有框架 |
| 并发写入同一 JSONL | **低** | 6 | 每会话独占一个文件，无并发问题 |

### 10.9 验收标准

**第 5 批验收**（初步功能测试）：
```bash
# 1. 启动服务器
bun run http-serve --port 8080

# 2. 创建两个不同凭据的会话
curl -X POST http://localhost:8080/v1/sessions \
  -d '{"apiKey":"sk-user-a","baseUrl":"https://api.anthropic.com","model":"claude-sonnet"}'
# → { "id": "session-a-id" }

curl -X POST http://localhost:8080/v1/sessions \
  -d '{"apiKey":"sk-user-b","baseUrl":"https://api.anthropic.com","model":"claude-opus"}'
# → { "id": "session-b-id" }

# 3. 各自发送真实消息，验证 LLM 响应
curl -N http://localhost:8080/v1/sessions/session-a-id/message \
  -d '{"content":"List the files in the current directory"}'
# → SSE: event: assistant → real LLM response with tool use → file list

curl -N http://localhost:8080/v1/sessions/session-b-id/message \
  -d '{"content":"What is 2+2?"}'
# → SSE: event: assistant → different LLM response

# 4. 验证对话历史独立
curl http://localhost:8080/v1/sessions/session-a-id/message \
  -d '{"content":"What did I just ask you to do?"}'
# → 应该记住是"list files"
```

**第 6 批验收**（持久化与恢复）：
```bash
# 1. 创建会话并发消息
# 2. 销毁会话
curl -X DELETE http://localhost:8080/v1/sessions/session-a-id

# 3. 从历史记录恢复
curl -X POST http://localhost:8080/v1/sessions \
  -d '{"apiKey":"sk-user-a","resumeFrom":"session-a-id"}'
# → 新会话，但保留旧对话上下文

# 4. 继续对话，验证历史记忆
```

**CLI 兼容性验收**：
- 所有修改后，不使用 `http-serve`，CLI 模式功能完全正常
- 现有测试套件全部通过

