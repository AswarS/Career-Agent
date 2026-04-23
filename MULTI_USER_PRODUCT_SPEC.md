# Claude Code 多用户版 — 产品规格说明书

> 版本: 1.0 | 状态: 开发中 | 最后更新: 2026-04-18

---

## 1. 产品概述

### 1.1 产品定位

将单用户 CLI 工具 Claude Code 改造为**前后端分离的多用户应用**。后端作为单进程服务运行，支持多个用户通过独立配置（用户 ID、API Key、Base URL）创建隔离的对话实例。每个用户的权限、Token 计算、对话历史完全隔离，体验等同于独立使用一个 Claude Code。

前端由外部团队开发，本项目只负责后端。向前端暴露的接口数据结构在核心功能完成后统一制定。

### 1.2 核心价值主张

| 维度 | 描述 |
|------|------|
| 资源效率 | 单后端进程承载多用户实例，避免为每个用户启动独立进程 |
| 完全隔离 | 会话、权限、Token 计算、历史记录全部隔离，用户间不可见 |
| 零侵入兼容 | 复用 Claude Code 核心逻辑，通过 ALS 实现多用户隔离，无需改动原有代码 |
| 接口可扩展 | 后端通过 REST/WebSocket 对外服务，前端可独立对接 |

### 1.3 整体架构

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

### 1.4 工作边界

| 范围 | 负责方 | 说明 |
|------|--------|------|
| 后端核心（多用户隔离、实例管理、QueryEngine） | 本项目 | 当前重点 |
| 终端调试命令 (`/instance`) | 本项目 | 用于本地验证后端功能 |
| 接口数据结构定义 | 本项目 | 核心功能完成后统一制定 |
| 前端 Web UI | 外部团队 | 对接后端 REST/WebSocket API |

---

## 2. 后端核心功能

### 2.1 核心能力

后端是整个系统的核心，负责多用户实例管理、请求路由和隔离。

| 能力 | 说明 | 状态 |
|------|------|------|
| 多用户实例管理 | 创建/销毁/恢复隔离的用户实例 | 已完成 |
| ALS 隔离路由 | 基于请求上下文自动路由到对应实例的 STATE | 已完成 |
| QueryEngine 集成 | 每实例独立的对话引擎 | 已完成 |
| MCP 工具支持 | 每实例独立 MCP 连接 | 已完成 |
| 对话持久化 | JSONL 格式转录，支持断点恢复 | 已完成 |
| 生产中间件 | CORS / 速率限制 / 结构化日志 | 已完成 |
| REST API | 会话 CRUD + SSE 流式消息 | 已完成 |
| WebSocket | 双向实时通信，支持中断 | 已完成 |

### 2.2 后端内部架构

```
+----------------------------------------------------------+
|                     Backend Server                         |
|                                                            |
|  +------------------------------------------------------+ |
|  |                    API 层                              | |
|  |  REST Router  |  WebSocket Handler  |  中间件链        | |
|  +------------------------------------------------------+ |
|                            |                               |
|  +------------------------------------------------------+ |
|  |              SessionManager                           | |
|  |  创建实例 | 销毁实例 | 超时清理 | 断点恢复              | |
|  +------------------------------------------------------+ |
|                            |                               |
|  +----------+  +----------+  +----------+                 |
|  | Instance |  | Instance |  | Instance |  ...            |
|  |  alice   |  |   bob    |  |  carol   |                 |
|  |          |  |          |  |          |                 |
|  | - STATE  |  | - STATE  |  | - STATE  |                 |
|  | - APIKey |  | - APIKey |  | - APIKey |                 |
|  | - Query  |  | - Query  |  | - Query  |                 |
|  |  Engine  |  |  Engine  |  |  Engine  |                 |
|  | - MCP    |  | - MCP    |  | - MCP    |                 |
|  | - CWD    |  | - CWD    |  | - CWD    |                 |
|  +----------+  +----------+  +----------+                 |
|                            |                               |
|  +------------------------------------------------------+ |
|  |          AsyncLocalStorage Router                     | |
|  |  将每个请求/操作路由到对应实例的 STATE                   | |
|  +------------------------------------------------------+ |
+----------------------------------------------------------+
```

### 2.3 请求处理流程

```
请求进入（REST / WebSocket / 终端）
    |
    v
[中间件] --> CORS / 限流 / 日志 / 关联 ID
    |
    v
[路由分发] --> 解析 sessionId --> 查找实例
    |
    v
[ALS 绑定] --> SessionContext.run(instance.state, callback)
    |
    v
[业务处理] --> QueryEngine 对话 / 工具调用
    |
    v
[响应] --> SSE 流 / WebSocket 消息 / 终端输出
```

### 2.4 核心组件

| 组件 | 职责 |
|------|------|
| REST Router | HTTP 请求路由与参数解析 |
| WebSocket Handler | 双向实时通信管理 |
| 中间件链 | CORS / 速率限制 / 请求关联 ID / 日志 |
| SessionManager | 实例生命周期（创建/销毁/超时/恢复） |
| SessionContext | ALS 上下文隔离，将请求路由到实例 STATE |
| QueryEngineFactory | 每实例 QueryEngine 创建 |
| API Client | 每实例独立 API 调用（Key/URL 隔离） |

---

## 3. 终端调试模式

### 3.1 定位

终端模式是**本地开发调试**手段，在后端核心开发阶段，不依赖前端即可直接验证多用户实例的创建、切换、对话功能。

### 3.2 命令

| 命令 | 说明 |
|------|------|
| `/instance new` | 交互式输入用户 ID、API Key、Base URL 创建实例 |
| `/instance list` | 列出所有活跃实例 |
| `/instance switch <id>` | 切换到指定实例（绑定其隔离 STATE） |
| `/instance close <id>` | 关闭实例并保存转录 |
| `/instance resume <id>` | 从历史转录恢复实例 |
| `/instance info` | 显示当前实例配置 |

### 3.3 调试流程示例

```
$ claude

> /instance new
  用户 ID: user-alice
  API Key:  sk-ant-...
  Base URL: https://api.anthropic.com
  [实例已创建] sess-abc123

> /instance switch sess-abc123
  [已切换] user-alice

> 请帮我看看 src/app.ts 有什么问题     # 正常对话，在 alice 隔离上下文中

> /instance new
  用户 ID: user-bob
  API Key:  sk-ant-xxx
  [实例已创建] sess-def456

> /instance switch sess-def456
  [已切换] user-bob                     # 切换到 bob 的隔离上下文

> 帮我写个排序算法                      # bob 的独立对话
```

---

## 4. 多用户隔离模型

### 4.1 隔离维度

| 隔离维度 | 实现机制 | 隔离粒度 |
|----------|----------|----------|
| 状态 (STATE) | 每实例深拷贝全局 STATE | 完全隔离 |
| API 凭证 | 实例级 apiKey + baseUrl | 完全隔离 |
| 工作目录 | 实例绑定独立 cwd | 完全隔离 |
| QueryEngine | 每实例独立实例 | 完全隔离 |
| MCP 连接 | 每实例独立 MCP 客户端 | 完全隔离 |
| 对话历史 | JSONL 文件按实例 ID 存储 | 完全隔离 |
| Token 计算 | 每实例 STATE 独立计算 | 完全隔离 |
| 工具权限 | 每实例独立权限策略 | 完全隔离 |

### 4.2 AsyncLocalStorage 隔离原理

```typescript
// 请求进入时：绑定实例上下文
SessionContext.run(instance.state, () => {
  // 在此回调内，所有对 STATE 的访问自动路由到 instance.state
  handleRequest(req);
});

// 模块级别代码通过 getState() 获取当前实例的 STATE
function getState(): AppState {
  const sessionState = SessionContext.getStore();
  return sessionState ?? globalSTATE;  // 降级：无上下文时用全局 STATE
}
```

关键特性：
- 零代码侵入：现有 Claude Code 逻辑无需修改
- 自动传播：异步操作自动继承上下文
- 降级兼容：无 ALS 上下文时回退到全局 STATE

### 4.3 API 凭证隔离

```typescript
// 实例创建时绑定独立凭证
instance.apiKey = userProvidedApiKey;
instance.baseUrl = userProvidedBaseUrl;

// API 调用时自动使用实例凭证
function makeApiCall() {
  const state = getState();
  // 使用 state 中存储的实例级 apiKey，完全绕过全局 ANTHROPIC_API_KEY
}
```

---

## 5. 安全与权限

### 5.1 凭证管理

- 每个实例创建时提交 API Key，后端仅存于内存
- API Key 不写入日志、不持久化到明文文件
- 实例销毁后 API Key 从内存中清除
- Base URL 支持自定义，可对接 Anthropic 官方或兼容 API

### 5.2 隔离保证

| 保证项 | 说明 |
|--------|------|
| 状态隔离 | 实例间 STATE 完全独立，互不影响 |
| 文件系统隔离 | 每实例绑定工作目录，工具操作限定在范围内 |
| 网络隔离 | 各实例使用独立 API 连接，凭证不互通 |
| 历史隔离 | 对话记录按实例 ID 独立存储，无交叉访问 |
| 内存隔离 | 实例关闭时释放全部关联资源 |

### 5.3 生产安全

- CORS 白名单
- 按客户端 IP 速率限制
- 请求体大小限制
- 请求关联 ID 追踪

---

## 6. 实例生命周期

### 6.1 状态流转

```
[创建] --> [活跃] --> [闲置超时] --> [自动销毁]
               |
               +--> [主动销毁] --> [转录保存]
               |
               +--> [服务关闭] --> [全部转录保存]
                                      |
                               [断点恢复] --> [活跃]
```

### 6.2 持久化

- **格式**: JSONL，每行一条消息
- **内容**: 完整对话记录（用户消息、助手回复、工具调用及结果）
- **路径**: `{dataDir}/instances/{instanceId}.jsonl`
- **恢复**: 创建实例时指定 `resumeFrom` 或终端 `/instance resume`

### 6.3 资源管理

| 操作 | 资源 |
|------|------|
| 创建实例 | STATE 深拷贝 (~2MB) + QueryEngine (~5MB) + MCP 连接 (~1MB/个) |
| 销毁实例 | 释放全部资源 + 事件监听器清理 + 计时器清理 |

---

## 7. 使用场景

### 场景 1: 团队共享开发助手

> 团队部署一个后端服务，成员通过前端页面各自创建实例。每人独立工作目录、独立对话历史。管理员可查看活跃实例数。

### 场景 2: 多账户 API Key 管理

> 用户拥有多个 Anthropic 账户，分别创建实例绑定不同 API Key，用量和成本完全独立。

### 场景 3: 上层产品集成

> 开发者基于后端 REST/WebSocket API 构建产品（代码审查、文档生成等），每个终端用户对应一个隔离实例。

### 场景 4: 本地调试

> 开发者通过终端 `/instance` 命令快速创建和切换实例，验证多用户隔离功能。

---

## 8. 技术路线图

### 已完成（后端核心）

| 阶段 | 内容 |
|------|------|
| ALS 隔离层 | 核心状态隔离机制 |
| 服务骨架 | Bun.serve + REST/WebSocket |
| 会话管理 | SessionManager + API 客户端隔离 |
| QueryEngine 集成 | 每实例独立对话引擎 |
| 会话持久化 | JSONL 转录 + 断点恢复 |
| MCP 工具支持 | 每实例独立 MCP 连接 |
| 生产加固 | CORS/限流/日志中间件 |
| 关键修复 | API Key 路由 + WebSocket 修复 |

### 待开发

| 阶段 | 内容 |
|------|------|
| 终端 `/instance` 命令 | CLI 内实例管理命令（调试用） |
| 端到端测试 | 真实 API Key 验证、多实例隔离测试 |
| 接口数据结构定义 | 统一定义 REST/WebSocket 请求/响应格式，供前端对接 |
| Docker 部署 | 容器化 + 健康检查 + 进程管理 |
| 监控体系 | 会话指标 + 内存监控 + 告警 |

---

## 9. 术语表

| 术语 | 定义 |
|------|------|
| ALS | AsyncLocalStorage，异步上下文隔离机制 |
| STATE | Claude Code 全局状态对象（配置、权限、Token 用量等） |
| Instance | 一个用户的隔离使用上下文（STATE + QueryEngine + MCP + CWD） |
| SessionManager | 实例生命周期管理组件 |
| QueryEngine | Claude Code 对话引擎，负责消息处理、工具调用、流式响应 |
| MCP | Model Context Protocol，Claude 外部工具连接协议 |
| JSONL | JSON Lines，用于持久化对话转录 |
| SSE | Server-Sent Events，HTTP 流式推送协议 |
