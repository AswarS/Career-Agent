# Batch 16: P1 用户隔离缺陷修复

> 审计日期：2026-04-22
> 状态：进行中
> 前置：Batches 1-15 已完成 (409 tests pass)

---

## 1. 缺陷清单

### 16a. sessionState.ts — 会话状态机 (P1)

- **文件**: `src/utils/sessionState.ts`
- **现状**: `currentState` (idle/running/requires_action) 和 `hasPendingAction` 为模块级共享
- **影响**: 用户 A 触发 requires_action，用户 B 的 sessionState 也变为 requires_action
- **涉及变量**: `currentState`, `hasPendingAction`
- **修复**: 移入 STATE，accessor 函数通过 getState()
- **注意**: 3 个 listener (stateListener, metadataListener, permissionModeListener) 保留模块级 — 它们是回调注册，不是数据状态

### 16b. sessionStart.ts — pendingInitialUserMessage (P1)

- **文件**: `src/utils/sessionStart.ts`
- **现状**: `pendingInitialUserMessage` 为模块级字符串
- **影响**: 用户 A 的 hook 设置 initialUserMessage，被用户 B 的 takeInitialUserMessage() 取走
- **涉及变量**: `pendingInitialUserMessage`
- **修复**: 移入 STATE

### 16c. sessionMemoryUtils.ts — 会话记忆状态 (P1)

- **文件**: `src/services/SessionMemory/sessionMemoryUtils.ts`
- **现状**: 5 个模块级变量
- **涉及变量**:
  - `sessionMemoryConfig` (SessionMemoryConfig)
  - `lastSummarizedMessageId` (string | undefined)
  - `extractionStartedAt` (number | undefined)
  - `tokensAtLastExtraction` (number)
  - `sessionMemoryInitialized` (boolean)
- **影响**: 记忆提取阈值/状态跨会话共享，一个 session 的记忆提取影响另一个 session 的阈值计算
- **修复**: 移入 STATE，5 个字段

### 16d. sessionMemory.ts — lastMemoryMessageUuid (P1)

- **文件**: `src/services/SessionMemory/sessionMemory.ts`
- **现状**: `lastMemoryMessageUuid` 和 `hasLoggedGateFailure` 为模块级共享
- **涉及变量**: `lastMemoryMessageUuid`, `hasLoggedGateFailure`
- **修复**: 移入 STATE (2 个字段)

### 16e. microCompact.ts — 压缩状态 (P1)

- **文件**: `src/services/compact/microCompact.ts`
- **现状**: `cachedMCState`, `pendingCacheEdits` 为模块级共享
- **涉及变量**: `cachedMCModule` (惰性加载，可保留), `cachedMCState`, `pendingCacheEdits`
- **影响**: 缓存压缩编辑跨会话泄漏
- **修复**: `cachedMCState` 和 `pendingCacheEdits` 移入 STATE

### 16f. extractMemories.ts — 记忆提取器 (P1)

- **文件**: `src/services/extractMemories/extractMemories.ts`
- **现状**: `extractor` 和 `drainer` 为模块级闭包
- **涉及变量**: `extractor`, `drainer`
- **影响**: 提取器闭包跨会话共享，内含 cursor/overlap guard 等 mutable state
- **修复**: 移入 STATE (2 个字段)

### 16g. fastMode.ts — 快速模式运行状态 (P1)

- **文件**: `src/utils/fastMode.ts`
- **现状**: `runtimeState`, `orgStatus`, `hasLoggedCooldownExpiry`, `lastPrefetchAt`, `inflightPrefetch` 为模块级共享
- **影响**: 一个 session 进入 cooldown，其他 session 也受影响
- **修复**: 移入 STATE (5 个字段)

---

## 2. State 新增字段

```typescript
// sessionState.ts
ssCurrentState: 'idle' | 'running' | 'requires_action'
ssHasPendingAction: boolean

// sessionStart.ts
ssPendingInitialUserMessage: string | undefined

// sessionMemoryUtils.ts
smConfig: SessionMemoryConfig
smLastSummarizedMessageId: string | undefined
smExtractionStartedAt: number | undefined
smTokensAtLastExtraction: number
smInitialized: boolean

// sessionMemory.ts
smLastMemoryMessageUuid: string | undefined
smHasLoggedGateFailure: boolean

// microCompact.ts
mcCachedState: unknown | null
mcPendingCacheEdits: unknown | null

// extractMemories.ts
emExtractor: unknown | null
emDrainer: unknown | null

// fastMode.ts
fmRuntimeState: unknown  // FastModeRuntimeState
fmOrgStatus: unknown     // FastModeOrgStatus
fmHasLoggedCooldownExpiry: boolean
fmLastPrefetchAt: number
fmInflightPrefetch: Promise<void> | null
```

## 3. 实施记录

_待填写_
