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

### 第 2 批：服务器骨架 🔧 进行中

| 子项 | 状态 | 说明 |
|------|------|------|
| 2a. `backend/src/server/index.ts` | ⬜ 未开始 | Bun.serve 入口 |
| 2b. `backend/src/main.tsx` http-serve 子命令 | ⬜ 未开始 | Commander 注册 |
| 2c. `backend/src/server/config.ts` | ✅ 已完成 | parseServerConfig，CLI/env/default 优先级 |
| 2d. `backend/package.json` http-serve 脚本 | ⬜ 未开始 | |

### 第 3 批：会话管理 + API 客户端 🔧 进行中

| 子项 | 状态 | 说明 |
|------|------|------|
| 3a. `backend/src/server/SessionManager.ts` | ⬜ 未开始 | |
| 3b. `backend/src/services/api/client.ts` 服务模式 | ⬜ 未开始 | |
| 3c. `backend/src/server/permissions.ts` | ✅ 已完成 | checkToolPermission，4 种模式 |

### 第 4 批：API 端点 + 可用性 🔧 进行中

| 子项 | 状态 | 说明 |
|------|------|------|
| 4a. `backend/src/server/router.ts` | ⬜ 未开始 | |
| 4b. `backend/src/server/wsHandler.ts` | ⬜ 未开始 | |
| 4c. `isHeadless` 标记 + Ink 解耦 | ⬜ 未开始 | |
| 4d. `backend/src/server/filesystemIsolation.ts` | ✅ 已完成 | validatePath 路径穿越防护 |
| 4e. `backend/src/server/cleanup.ts` | ✅ 已完成 | WS/MCP/AbortController 资源清理 |

### 已有文件（User-Separate 分支）

```
backend/src/server/
  ├── SessionContext.ts          ✅ ALS 容器 (77 行)
  ├── createDirectConnectSession.ts  (已有，不改)
  ├── directConnectManager.ts        (已有，不改)
  └── types.ts                       (已有，2 批扩展)

backend/src/bootstrap/
  └── state.ts                   🔧 createIsolatedState 已加，ALS 路由未加

tests/
  └── state-als.test.ts          ✅ 23 测试 47 断言（等 state.ts ALS 完成后可通过）
```

### 下一步行动

1. ~~**完成 1e**：为 state.ts 所有 accessor 注入 ALS routing~~ ✅
2. ~~**完成 1c**：sessionSwitched 移入 SessionContext~~ ✅
3. ~~运行测试确认全部通过~~ ✅ (28 tests, 53 assertions)
4. **开始第 2 批**：服务器骨架 (index.ts, main.tsx http-serve, config.ts, package.json)
