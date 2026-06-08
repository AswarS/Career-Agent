# Bug 修复：后端 LLM 推理失败（从 QueryEngine 迁移到直连 API）

## 日期
2026-04-28

## 现象
前端发送消息后，后端返回 stub 回复 `"Stub agent reply: ..."` 而非真实 LLM 推理结果。后端日志无任何错误输出（静默吞掉了所有异常）。

---

## 根因分析

### 调用链路（设计意图）

```
前端 sendMessage()
  → conversation.controller.ts POST /messages
    → conversation.service.ts sendMessage()
      → agent.service.ts sendMessage()
        → tryRealInference()
          → getOrCreateQueryEngine()    ← 创建 QueryEngine
          → qe.submitMessage()          ← 发起 LLM 推理
```

`tryRealInference` 有两层 `try/catch`，但 **全部静默吞掉异常**，只返回 `{ success: false }`，导致外层直接走 stub 分支，无任何日志。

### 逐层排查过程

#### 1. Config accessed before allowed
**错误位置**: `utils/config.ts:1428`

**原因**: `config.ts` 有一个模块级门控变量 `configReadingAllowed`，默认 `false`。CLI 模式下启动时会调用 `enableConfigs()` 将其置为 `true`。但 NestJS 服务端启动时没有调用此函数。

**触发链路**:
```
createQueryEngineForSession()
  → getTools(toolPermissionContext)
    → WebSearchTool.isEnabled()
      → getDefaultMainLoopModel()
        → isMaxSubscriber()
          → getAnthropicApiKeyWithSource()
            → getGlobalConfig()
              → getConfig()  ← 💥 THROW: "Config accessed before allowed."
```

**修复**: 在 `backend/src/Network/main.ts` 中添加 `enableConfigs()` 调用。

#### 2. MACRO is not defined
**错误位置**: `constants/prompts.ts:218`

**原因**: 全局变量 `MACRO`（包含 VERSION、ISSUES_EXPLAINER 等）由 `bootstrapMacro.ts` 的 `ensureBootstrapMacro()` 注入到 `globalThis`。CLI 模式启动时调用，NestJS 未调用。

**触发链路**:
```
qe.submitMessage()
  → fetchSystemPromptParts()
    → getSystemPrompt()
      → getSimpleDoingTasksSection()
        → MACRO.ISSUES_EXPLAINER  ← 💥 ReferenceError
```

**修复**: 在 `backend/src/Network/main.ts` 中添加 `ensureBootstrapMacro()` 调用。

#### 3. Cannot destructure property 'settings' from null
**错误位置**: `utils/settings/settings.ts:813`

**原因**: `agent.service.ts` 的 `buildSessionContext()` 将 `state` 设为空对象 `{}`。但 `getState()` 在 ALS 模式下返回 `ctx.state`，所有属性（包括 `settingsSessionCache`）都是 `undefined`。`getSettingsWithErrors()` 从缓存取到 `undefined`（非 `null`），直接返回 `undefined`，导致调用方解构失败。

**触发链路**:
```
qe.submitMessage()
  → shouldEnableThinkingByDefault()
    → getSettingsWithErrors()
      → getSessionSettingsCache()
        → getState().settingsSessionCache  ← undefined
      → return undefined
    → const { settings } = undefined  ← 💥 TypeError
```

**修复**: 将 `state: {}` 改为 `state: createIsolatedState({ sessionId: conversationId })`，使用完整的默认 State 对象。

#### 4. Streaming is required
**错误位置**: Anthropic SDK 客户端

**原因**: `conversation.service.ts` 中硬编码的 API 配置指向 **OpenAI 兼容** 的第三方 API（`https://llmapi.paratera.com/v1` + `DeepSeek-V4-Flash`），但代码使用的是 `Anthropic` SDK，其请求格式（`/v1/messages`）与 OpenAI 格式（`/v1/chat/completions`）不兼容。

**修复**: 这是最后一个问题，也是最终决定重写方案的关键。

---

## 最终解决方案

### 方案选择

QueryEngine 是为 CLI 模式设计的重量级组件，依赖大量 CLI 专有基础设施（settings 系统、config 系统、plugin 加载器、ALS 状态管理、MACRO 注入等）。在 NestJS 服务端环境中适配成本极高，且每修一层会暴露下一层问题。

**决策**: 绕过 QueryEngine，在 `agent.service.ts` 中直接用 `fetch` 调用 OpenAI 兼容的 `/chat/completions` 接口。

### 具体改动

| 文件 | 改动 |
|---|---|
| `backend/src/Network/main.ts` | 添加 `enableConfigs()` + `ensureBootstrapMacro()` |
| `backend/src/Network/modules/agent/agent.service.ts` | 移除 QueryEngine/Anthropic SDK 依赖，改用 `fetch` 直调 OpenAI 兼容 API，支持多轮对话历史 |
| `backend/src/server/queryEngineFactory.ts` | 添加 `thinkingConfig: { type: 'disabled' }`（备用，当前未被引用） |

### 核心代码逻辑

```typescript
// agent.service.ts - tryRealInference()
const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: model ?? 'deepseek-chat',
    messages: history,  // 多轮对话历史
    max_tokens: 4096,
    stream: false,
  }),
});

const data = await response.json();
const reply = data.choices?.[0]?.message?.content;
```

---

## 经验教训

1. **不要静默吞异常**: 原始代码的 `try/catch` 没有任何日志，导致排查困难。应至少 `console.error` 错误信息。
2. **CLI 组件不等于服务端组件**: QueryEngine 依赖 CLI 启动初始化链路（config → macro → settings → plugins），在 NestJS 中需要逐一补齐或完全绕过。
3. **注意 API 格式兼容性**: Anthropic SDK 和 OpenAI SDK 的请求格式不同，第三方代理 API 通常只兼容其中一种，需要根据实际 endpoint 选择正确的调用方式。
4. **`state: {}` 是隐患**: ALS 上下文中的 state 必须是完整初始化的对象，空对象会导致所有属性访问返回 `undefined`，引发难以追踪的解构错误。
