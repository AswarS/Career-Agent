# 实现计划：修复应用展示机制

## 问题分析

### 当前错误
浏览器显示：`{"error":"path traversal detected"}`

### 根本原因
`generated.utils.ts` 在 Windows 上路径分隔符混用导致安全检查失败：
```typescript
// Line 38
if (!normalized.startsWith(userDir + '/') && normalized !== userDir) {
  return { ok: false, error: 'path traversal detected' };
}
```

- Windows 上 `normalize()` 返回：`D:\Download\...\user\1\html_generated\snake.html`（使用 `\`）
- 但检查用：`userDir + '/'` = `D:\Download\...\user\1/`（混用分隔符）
- 导致：`normalized` 不以 `userDir + '/'` 开头 → 触发 path traversal 错误

### 架构理解
根据 `artifact-display-guide.md`，系统有两种应用展示方式：

#### 方式 1：消息内嵌 media（当前实现）
```
Skill → outputFiles → skillOutputFilesToMedia → MessageMedia (kind: 'html', url: '/api/...') 
→ 前端 ConversationMessageCard 渲染 <iframe>
```

**问题**：
1. Windows 路径分隔符导致 `generated.controller.ts` 无法提供文件（path traversal）
2. 前端 `normalizeMessageMedia` 之前过滤了 html/app（已修复）

#### 方式 2：Artifact 工作画布（文档推荐）
```
Skill → 创建 ArtifactEntity → 消息中添加 actions (open-artifact) 
→ 前端点击按钮 → getArtifact API → ArtifactHost 渲染 iframe
```

**当前状态**：
- ✅ 后端有 `ArtifactEntity` 和 `ArtifactService`
- ❌ `ArtifactService` 没有 `createArtifact` 方法
- ❌ `ArtifactController` 路由不完整（只有 list，没有 getById）
- ❌ Skill handler 不创建 artifact 记录
- ❌ 消息中没有 actions

## 实现方案

### 方案 A：最小修复（优先，快速解决当前错误）

**目标**：修复 path traversal 错误，让当前 media 方式能工作

**修改文件**：
1. `CrescoAI-Backend/backend/src/Network/modules/generated/generated.utils.ts`
   - 修复 `resolveGeneratedPath` 和 `resolveAppPath` 中的路径分隔符问题
   - 使用 `path.sep` 代替硬编码的 `/`

**优点**：
- 修改最小，立即可用
- 不破坏现有实现
- 前端 `normalizeMessageMedia` 已修复，支持 html/app

**缺点**：
- 不符合文档推荐的 artifact 工作画布方式
- 游戏/应用直接嵌在消息中，没有专用画布

### 方案 B：完整 Artifact 实现（长期，符合架构）

**目标**：按照文档指南实现完整的 artifact 工作画布

**后端修改**：
1. 修复 `generated.utils.ts` 路径问题（同方案 A）
2. 扩展 `ArtifactService`：
   - 添加 `createArtifact(dto)` 方法
   - 保存 artifact 到数据库
3. 修复 `ArtifactController`：
   - 修复 `GET :id` 路由（改为 `getArtifactById` 而非 list）
   - 实现 `POST :id/refresh`
4. 修改 `develop-web-game` skill handler：
   - 生成文件后创建 `ArtifactEntity`
   - 在 skill result 中添加 `artifactId`
5. 修改 `ConversationService.sendMessage`：
   - 当 skill result 包含 `artifactId` 时
   - 在 assistant 消息中添加 `actions: [{kind: 'open-artifact', artifactId, ...}]`

**前端修改**：
- ✅ 已完成：`normalizeMessageMedia` 支持 html/app
- ✅ 已存在：`ArtifactHost` 组件完整
- ✅ 已存在：action 按钮和 `openArtifact` 逻辑

**优点**：
- 符合架构设计
- 应用在专用工作画布展示（pane/focus/immersive 模式）
- artifact 可独立刷新、管理

**缺点**：
- 修改较多
- 需要更多测试

## 推荐方案

**采用方案 A + 方案 B 分步实施：**

### 第一步：紧急修复（方案 A）
立即修复 path traversal 错误，让系统能正常展示应用

### 第二步：架构完善（方案 B）
实现完整的 artifact 系统，符合长期架构

## 实施细节

### 第一步：修复 path traversal

#### 文件：`generated.utils.ts`

**问题代码（Line 38-39）**：
```typescript
if (!normalized.startsWith(userDir + '/') && normalized !== userDir) {
  return { ok: false, error: 'path traversal detected' };
}
```

**修复方案**：
```typescript
import { join, normalize, sep } from 'node:path';

// Line 38 改为：
const userDirWithSep = userDir + sep;
if (!normalized.startsWith(userDirWithSep) && normalized !== userDir) {
  return { ok: false, error: 'path traversal detected' };
}
```

同样修复 `resolveAppPath` 函数（Line 71）。

### 第二步：Artifact 完整实现（可选）

#### 1. ArtifactService 添加 createArtifact

```typescript
async createArtifact(dto: {
  userId: number;
  type: string;
  title: string;
  renderMode: 'html' | 'url' | 'markdown' | 'cards';
  payloadPath?: string;
  summary?: string;
}): Promise<ArtifactEntity> {
  const artifact = this.artifactRepo.create({
    userId: dto.userId,
    type: dto.type,
    title: dto.title,
    status: 'ready',
    renderMode: dto.renderMode,
    payloadPath: dto.payloadPath,
    summary: dto.summary,
    createdAt: new Date(),
  });
  return this.artifactRepo.save(artifact);
}
```

#### 2. ArtifactController 修复路由

当前错误：`GET :id` 把 `id` 当成 `userId`。

修复：
```typescript
@Get()
listArtifacts(@Req() req: Request) {
  return this.artifactService.listArtifacts(req.userId);
}

@Get(':artifactId')
getArtifact(@Req() req: Request, @Param('artifactId') artifactId: string) {
  return this.artifactService.getArtifactById(Number(artifactId));
}
```

#### 3. Skill handler 创建 artifact

```typescript
// 在 develop-web-game handler 中，复制文件后：
if (context.userId) {
  const artifact = await this.artifactService.createArtifact({
    userId: context.userId,
    type: 'game',
    title: artifact.description ?? description,
    renderMode: 'url',
    payloadPath: `/api/career-agent/generated/${context.userId}/${kind}/${filename}`,
    summary: `Generated ${kind} game application`,
  });
  
  response.artifactId = artifact.id;
}
```

#### 4. ConversationService 添加 actions

在写 assistant 消息时：
```typescript
const message = {
  id: assistantMessageId,
  role: 'assistant',
  content: [{ type: 'text', text: skillResult.reply }],
  actions: skillResult.artifactId ? [{
    id: `action-open-${skillResult.artifactId}`,
    kind: 'open-artifact',
    label: '打开应用',
    artifact_id: String(skillResult.artifactId),
    view_mode: 'focus',
  }] : undefined,
};
```

## 验证步骤

### 方案 A 验证
1. 重启后端
2. 发送：`/develop-web-game 生成贪吃蛇游戏`
3. 检查日志：`Network/logs/skill/2026-06-08.log`
4. 检查浏览器：应该看到 iframe 显示游戏，不再是 path traversal 错误
5. 验证 URL：`http://localhost:4000/api/career-agent/generated/1/html/snake.html`

### 方案 B 验证
1. 发送消息后，检查数据库 `artifacts` 表有记录
2. 消息中应该有"打开应用"按钮
3. 点击按钮 → 右侧工作画布展示应用
4. 可以切换 focus/immersive 模式

## 总结

**立即执行**：修复 `generated.utils.ts` 的 Windows 路径兼容问题（方案 A）

**后续优化**：实现完整的 artifact 系统（方案 B）

两个方案不冲突，可以分步实施。方案 A 是方案 B 的前置条件（静态文件服务必须能工作）。
