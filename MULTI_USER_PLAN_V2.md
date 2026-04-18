# Claude Code 多用户版 — 实施计划

> 对应产品规格：`MULTI_USER_PRODUCT_SPEC.md`
> 当前状态：Batches 1-11 已完成，326 tests, 0 fail, 700+ assertions
> 最后更新：2026-04-18

---

## 1. 项目目标

将单用户 CLI 工具 Claude Code 改造为**前后端分离的多用户应用**。

**本项目只负责后端**：
- 多用户实例隔离与生命周期管理
- ALS 请求路由，复用现有 Claude Code 核心逻辑
- 终端调试模式（`/instance` 命令），用于本地验证
- REST/WebSocket API 接口数据结构（核心功能完成后统一制定）

**不在本项目中**：
- 前端 Web UI（外部团队开发）
- 前端对接联调

**核心原则**：
- CLI 模式零改动，完全兼容
- 服务模式作为新增入口（`http-serve` 子命令）
- 用户之间完全隔离（API 客户端、对话历史、工作目录、状态、MCP 连接）

---

## 2. 容量规划

**方案 A（已采用）：进程内多会话 ALS 模式** — 所有用户共享一个 Bun 进程，通过 `AsyncLocalStorage` 隔离。

| 资源 | 单会话消耗 | 最大并发（4C16G） |
|------|-----------|---------|
| 内存（空闲） | ~8 MB | ~1500 |
| 内存（活跃） | ~20 MB | ~600 |

上限：100 个中度用户。

---

## 3. 核心架构

```
+-------------------+     +-------------------+
|   Web Frontend    |     |  Terminal (调试)   |
|  (外部团队开发)    |     |  /instance 命令   |
+--------+----------+     +--------+----------+
         |                         |
    REST API / WebSocket     进程内直接调用
         |                         |
         +----------+--------------+
                    |
         +----------v----------+
         |    Backend Server    |
         |    (Bun.serve)       |
         |                      |
         |  SessionManager      |
         |  Instance Pool       |
         |  ALS Router          |
         +----------+-----------+
                    |
         +----------v-----------+
         |   Anthropic API      |
         |  (每实例独立 Key/URL) |
         +----------------------+
```

请求流程：解析 sessionId → 获取 SessionContext → `AsyncLocalStorage.run(ctx, () => queryEngine.submitMessage(...))` → SSE/WS 推送响应 / 终端输出。

---

## 4. 实施计划

### 4.1 关键数据规模

| 指标 | 实际值 |
|------|--------|
| state.ts 导出函数 | **210 个**（约 100-120 个访问 STATE，需修改） |
| 导入 state.ts 的文件 | **260 个** |
| React/Ink 相关文件 | 731 文件（均为 UI 组件，服务模式不加载） |

### 4.2 实施优先级

```
第 1-9 批（后端核心）           ✅ 已全部完成

第 10 批（终端 /instance 命令） ✅ 已完成
  └── 本地调试手段，不依赖前端即可验证多用户功能

第 11 批（端到端测试）          ✅ 已完成
  └── 完整生命周期 + 多实例隔离 + ALS 路由 + WS + 并发压力测试

第 12 批（接口数据结构）        ← 当前最高优先级
  └── 统一定义 REST/WebSocket 请求/响应格式，供前端对接

第 13 批（部署 + 监控）         ← 依赖第 12 批
```

---

## 5. 已完成批次（1-9）

### 第 1 批：核心隔离层 ✅

| 子项 | 状态 | 说明 |
|------|------|------|
| 1a. `createIsolatedState` | ✅ | `backend/src/bootstrap/state.ts` — 工厂函数 |
| 1b. 模块变量移入 STATE | ✅ | interactionTimeDirty / outputTokensAtTurnStart 等已移入 |
| 1c. `sessionSwitched` Signal | ✅ | per-session ALS 路由 |
| 1d. `SessionContext.ts` | ✅ | ALS 容器 |
| 1e. state.ts ALS 路由 | ✅ | 所有 ~100+ accessor 使用 getState() |
| 1f. `cwd.ts` | ✅ | 自动路由 per-session |
| 测试 | ✅ | `batch1-isolation.test.ts` — 28 tests, 53 assertions |

### 第 2 批：服务器骨架 ✅

| 子项 | 状态 | 说明 |
|------|------|------|
| 2a. `backend/src/server/index.ts` | ✅ | Bun.serve 入口 + WS upgrade |
| 2b. `backend/src/main.tsx` http-serve | ✅ | Commander 子命令 |
| 2c. `backend/src/server/config.ts` | ✅ | 配置解析 |
| 2d. `backend/package.json` | ✅ | http-serve 脚本 |

### 第 3 批：会话管理 + API 客户端 ✅

| 子项 | 状态 | 说明 |
|------|------|------|
| 3a. `SessionManager.ts` | ✅ | 16 tests, 35 assertions |
| 3b. `client.ts` 服务模式 | ✅ | ALS 快速路径 |
| 3c. `permissions.ts` | ✅ | 4 种权限模式 |

### 第 4 批：API 端点 + 可用性 ✅

| 子项 | 状态 | 说明 |
|------|------|------|
| 4a. `router.ts` | ✅ | REST API |
| 4b. `wsHandler.ts` | ✅ | WS 双向协议 |
| 4c. `isHeadless` + Ink 解耦 | ✅ | ALS 路由 |
| 4d. `filesystemIsolation.ts` | ✅ | 路径穿越防护 |
| 4e. `cleanup.ts` | ✅ | 资源清理 |

### 第 5 批：QueryEngine 集成 ✅

| 子项 | 状态 | 说明 |
|------|------|------|
| 5a. `queryEngineFactory.ts` | ✅ | Per-session QueryEngine |
| 5b. SessionManager 集成 | ✅ | createSession 中创建 QueryEngine |
| 5c. `router.ts` 真实流式 | ✅ | SSE 使用 queryEngine.submitMessage() |
| 5d. `fsOperations.ts` cwd 修复 | ✅ | process.cwd() → pwd() |

### 第 6 批：对话持久化与会话恢复 ✅

| 子项 | 状态 | 说明 |
|------|------|------|
| 6a. 持久化验证 | ✅ | JSONL 自动写入 |
| 6b. 会话恢复 API | ✅ | `sessionResume.ts` |
| 6c. 历史列表 API | ✅ | `GET /v1/sessions/history` |
| 6d. resumeFrom 参数 | ✅ | router.ts 支持 |

### 第 7 批：MCP 连接与完整工具支持 ✅

| 子项 | 状态 | 说明 |
|------|------|------|
| 7a. Per-session MCP | ✅ | `mcpSessionManager.ts` |
| 7b. 完整工具集合并 | ✅ | `assembleToolPool()` |
| 7c. SessionManager MCP 集成 | ✅ | 生命周期管理 |
| 7d. createSession async | ✅ | MCP connectAll 异步 |
| 测试 | ✅ | 32 tests, 76 assertions |

### 第 8 批：生产加固 ✅

| 子项 | 状态 | 说明 |
|------|------|------|
| 8a. CORS 白名单 | ✅ | 可配置 origins |
| 8b. 速率限制 | ✅ | Per-IP 滑动窗口 |
| 8c. 请求体大小限制 | ✅ | 默认 1MB |
| 8d. 请求追踪 | ✅ | correlation ID |
| 8e. 结构化日志 | ✅ | 分级日志 |
| 8f. 配置扩展 | ✅ | 新增字段 |
| 8g. 中间件集成 | ✅ | 链式中间件 |
| 8h. 去除硬编码 CORS | ✅ | SSE 响应清理 |
| 测试 | ✅ | 38 tests, 63 assertions |

### 第 9 批：关键生产修复 ✅

| 子项 | 状态 | 说明 |
|------|------|------|
| P0: auth.ts ALS 快速路径 | ✅ | per-session apiKey |
| P0: QueryEngine ALS 包裹 | ✅ | runWithSessionContext() |
| P1: WebSocket QueryEngine | ✅ | 替换 echo 为真实流式 |
| P2: 工具执行 ALS 验证 | ✅ | pwd() 路由正确 |
| 测试 | ✅ | 20 tests, 41 assertions |

---

## 6. 已完成批次（10-11）

### 第 10 批：终端 `/instance` 命令 ✅

> **目标**：在终端中通过 `/instance` 系列命令管理多用户实例，不依赖前端即可验证后端核心功能。

| 子项 | 状态 | 说明 |
|------|------|------|
| 10a. 命令解析框架 | ✅ | `backend/src/commands/instance/` — CLI 命令注册 |
| 10b. `/instance new` | ✅ | 支持 `userId=alice apiKey=sk-xxx` 键值对参数 |
| 10c. `/instance list` | ✅ | 格式化输出所有活跃实例表格 |
| 10d. `/instance switch <id>` | ✅ | 8-char 短 ID 支持，ALS 上下文切换 |
| 10e. `/instance close <id>` | ✅ | 销毁实例 + 转录保存确认 |
| 10f. `/instance resume <id>` | ✅ | 重定向到 REST API |
| 10g. `/instance info` | ✅ | 当前实例详细配置 |
| 10h. InstanceCommandManager | ✅ | 单例模式，管理多实例生命周期 |
| 测试 | ✅ | `batch10-instance-commands.test.ts` — 32 tests, 61 assertions |

**关键文件**：
```
backend/src/server/instanceCommands.ts    ✅ 核心逻辑 (280 行)
backend/src/commands/instance/index.ts    ✅ 命令注册
backend/src/commands/instance/instance.ts ✅ 命令实现 (194 行)
backend/src/commands.ts                   ✅ 注册 /instance 命令
```

### 第 11 批：端到端集成测试 ✅

> **目标**：无真实 API Key 环境下，通过 echo 模式验证完整多用户流程。

| 子项 | 状态 | 说明 |
|------|------|------|
| 11a. REST API 全生命周期 | ✅ | health → create → message → list → delete 完整流程 |
| 11b. 多实例隔离验证 | ✅ | STATE/API Key/cwd/AbortController 独立性 |
| 11c. 工具执行 cwd ALS 路由 | ✅ | pwd() 在不同 ALS 上下文返回不同 cwd |
| 11d. JSONL 持久化验证 | ✅ | createdAt/sessionId/transcript 跟踪 |
| 11e. 会话恢复 e2e | ✅ | resumeFrom 404 处理（无转录文件） |
| 11f. InstanceCommandManager + REST | ✅ | 终端实例与 REST API 互通 |
| 11g. WebSocket 全生命周期 | ✅ | open → ping → user_message → interrupt |
| 11h. 并发压力测试 | ✅ | 10 个并发创建 + 批量销毁 |
| 测试 | ✅ | `batch11-e2e-integration.test.ts` — 26 tests, 87 assertions |

---

## 7. 待完成批次（12-13）

### 第 12 批：接口数据结构定义（当前最高优先级）

> **目标**：统一定义 REST/WebSocket 请求/响应格式，供前端对接。

| 子项 | 说明 |
|------|------|
| 12a. REST 请求/响应格式 | 定义 POST/GET/DELETE 各端点的 JSON schema |
| 12b. SSE 事件格式 | 定义 start/content/tool_use/tool_result/end 事件结构 |
| 12c. WebSocket 消息格式 | 定义 message/interrupt/content/permission_request 消息结构 |
| 12d. 错误码规范 | 定义 HTTP 状态码 + 业务错误码 |
| 12e. 接口文档 | 生成 OpenAPI/Swagger 或 Markdown 接口文档 |

### 第 13 批：部署与监控

> **目标**：生产环境部署、监控与运维。

| 子项 | 说明 |
|------|------|
| 13a. Dockerfile | 创建 Docker 镜像 |
| 13b. 健康检查增强 | /v1/health 深度检查 |
| 13c. 优雅关闭增强 | 确保进行中的 SSE 流完成 |
| 13d. 进程管理 | systemd/pm2 配置 |
| 13e. Explicit 权限模式 | WS 实时确认（permission_request/response/超时） |
| 13f. Prometheus 指标 | 请求数/延迟/token 用量/活跃实例数 |
| 13g. 对话长度限制 | 超阈值触发 compaction |
| 13h. 每实例内存监控 | 检测内存泄漏 |

---

## 7. 文件清单

### 已建文件

```
backend/src/server/
  ├── SessionContext.ts          ✅ ALS 容器 (66 行)
  ├── SessionManager.ts          ✅ 会话管理 (250 行)
  ├── config.ts                  ✅ 配置解析 (69 行)
  ├── permissions.ts             ✅ 权限模型 (85 行)
  ├── router.ts                  ✅ REST API (342 行)
  ├── wsHandler.ts               ✅ WS 协议 (170 行)
  ├── middleware.ts              ✅ 生产中间件 (273 行)
  ├── filesystemIsolation.ts     ✅ 路径隔离
  ├── cleanup.ts                 ✅ 资源清理
  ├── index.ts                   ✅ Bun.serve 入口 (115 行)
  ├── queryEngineFactory.ts      ✅ QueryEngine 工厂 (196 行)
  ├── sessionResume.ts           ✅ 会话恢复
  ├── mcpSessionManager.ts       ✅ Per-session MCP 连接管理
  └── types.ts                   ✅ ServerConfig

backend/src/bootstrap/
  └── state.ts                   ✅ ALS 路由完成

backend/src/utils/auth.ts        ✅ ALS 快速路径
backend/src/services/api/client.ts ✅ 服务模式快速路径

backend/tests/                   ✅ 12 文件, 326 tests, 700+ assertions
```

### 已建文件（第 10-11 批）

```
backend/src/server/
  └── instanceCommands.ts        ✅ /instance 命令解析与执行 (280 行)
backend/src/commands/instance/
  ├── index.ts                   ✅ 命令注册
  └── instance.ts                ✅ 命令实现 (194 行)
backend/tests/
  ├── batch10-instance-commands.test.ts  ✅ 32 tests
  └── batch11-e2e-integration.test.ts    ✅ 26 tests
```

### 修改文件（第 10 批）

| 文件 | 改动 |
|------|------|
| `backend/src/main.tsx` | 注册 `/instance` 命令处理（~30 行） |
| `backend/src/server/SessionManager.ts` | 暴露 getSession/closeSession 给终端命令用 |

---

## 8. 风险与缓解

| 风险 | 等级 | 批次 | 缓解 |
|------|------|------|------|
| /instance switch ALS 上下文切换丢失 | **高** | 10 | 全局指针 + SessionContext.run() 包裹 |
| 终端提示符与 Ink render 冲突 | **中** | 10 | 检测多实例模式时覆盖默认提示符 |
| 模块级变量跨会话污染 | ✅ 已解决 | 1 | 已移入 STATE |
| 权限对话框卡死 | ✅ 已解决 | 3 | allow_all 默认 |
| ALS 上下文丢失 | ✅ 已解决 | 1 | 降级逻辑 |
| 文件路径穿越 | ✅ 已解决 | 4 | filesystemIsolation |
| 接口格式不稳定 | **低** | 12 | 核心功能完成后统一制定 |
| 内存泄漏 | **低** | 13 | compaction + 超时回收 |

---

## 9. 测试策略

**第 1-9 批**：268 tests, 100% 通过，590 assertions ✅
**第 10 批**：32 tests, 61 assertions ✅
**第 11 批**：26 tests, 87 assertions ✅
**总计**：326 tests, 100% 通过，700+ assertions ✅

**第 10 批验收**（终端命令）：
```
1. /instance new → 输入 alice + apiKey → 实例创建成功
2. 对话 → 在 alice 隔离上下文中正常工作
3. /instance new → 输入 bob + 另一个 apiKey → 第二个实例
4. /instance switch → 切换到 bob → 对话在 bob 上下文
5. /instance list → 显示两个实例
6. /instance close → 销毁 alice → 验证转录保存
7. /instance resume → 恢复 alice → 继续对话
```

**第 11 批验收**（端到端）：
```bash
# 用真实 ANTHROPIC_API_KEY 启动服务器
bun run http-serve --port 9090

# 创建两个不同凭据的会话
curl -X POST http://localhost:9090/v1/sessions -d '{"apiKey":"sk-a","baseUrl":"https://api.a.com"}'
curl -X POST http://localhost:9090/v1/sessions -d '{"apiKey":"sk-b","baseUrl":"https://api.b.com"}'

# 各自发消息验证独立
curl -X POST http://localhost:9090/v1/sessions/<idA>/message -d '{"content":"Hello"}'
curl -X POST http://localhost:9090/v1/sessions/<idB>/message -d '{"content":"Hello"}'
```

---

## 10. 运行方式

```bash
# 开发调试（终端模式，/instance 命令）
claude

# 后端服务模式
bun run http-serve --port 9090 --auth-token secret

# 创建会话
curl -X POST http://localhost:9090/v1/sessions \
  -H "Authorization: Bearer secret" \
  -d '{"apiKey":"sk-ant-xxx","baseUrl":"https://api.anthropic.com"}'

# 发消息
curl -X POST http://localhost:9090/v1/sessions/<id>/message \
  -H "Authorization: Bearer secret" \
  -d '{"content":"Hello"}'

# WebSocket
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

## 11. 进度追踪

> 最后更新：2026-04-18

### 分支结构

```
User-Separate 分支 (career-agent/User-Separate)
  backend/
    src/          ← 源代码（对应 main 分支的 src/），2011 个 .ts/.tsx 文件
    shims/        ← shim 模块
    vendor/       ← 第三方
  backend/package.json
  backend/tsconfig.json
  backend/tests/  ← 测试文件（10 个文件）
```

### 提交历史

```
ccabda8b fix: critical production fixes — per-session API keys, WebSocket QueryEngine (batch 9)
a44fd2f2 feat: add production hardening middleware (batch 8)
1cd9f8ed feat: add per-session MCP connections and full tool support (batch 7)
df54ad5c feat: add session resume from JSONL transcripts and history endpoint (batch 6)
847fb98b feat: integrate QueryEngine for real LLM conversations (batch 5)
669c2392 fix: ALS routing for getIsHeadless/regenerateSessionId, add package.json + tests
f81f5c3e feat: add batch 4 — REST router, WS handler, Bun.serve entry, http-serve CLI
f5c1a5d2 docs: update progress for task 3a SessionManager complete
bb0906d3 feat: add SessionManager with full lifecycle (task 3a)
74bc7be5 feat: add server utility modules (batch 2+3)
5bdfd222 fix: complete Stage 1 - move module-level lets into State type (task 1b)
46b36b35 feat: add ALS routing to all ~100+ state accessor functions (task 1e)
0daa2da6 test: add batch 1 isolation tests (21 tests, 38 assertions)
15d03d86 feat: move sessionSwitched signal into per-session ALS routing
0a199114 add backend shims, src, vendor from claude-code-rev main
```

### 已知限制

1. **WebSearchTool 依赖订阅类型检查**：需要有效 API Key 才能通过检查。Per-session ALS 快速路径已修复，无 session apiKey 也无全局 env var 时回退到 echo 模式。

2. **ModelResolution 依赖 API 调用**：部分路径调用 Anthropic API 获取订阅信息。API key 无效或网络不通时可能影响工具初始化。

3. **JSONL 持久化路径**：使用 `~/.claude/projects/<sanitized-cwd>/<sessionId>.jsonl`，多用户 cwd 相同时写入同一目录但不同文件。多节点部署需共享存储。
