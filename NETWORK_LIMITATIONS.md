# Network 变更限制与后续协作手册

本手册记录本次只修改 `CrescoAI-Backend/backend/src/Network` 代码后，仍需要 agent 底层或前端配合的事项。

## 1. ReAct thinking 的源头开关不在 Network

Network 现在会在接口层保留并返回 thinking/reasoning，同时过滤 tool 调用和 tool 返回结果：

- assistant `thinking` -> `reasoning`
- assistant `text` -> `content/reply`
- `tool_use` / `tool_result` / `server_tool_use` / `mcp_tool_use` 不向前端展示

但底层 agent 是否真正产出 thinking，取决于 Network 外的 QueryEngine 配置。审查时发现 `backend/src/server/queryEngineFactory.ts` 中存在 `thinkingConfig: { type: 'disabled' }`，同时 `backend/src/Network/main.ts` 也设置了 `DISABLE_INTERLEAVED_THINKING=1`。由于真正开关需要 agent/server 配置一起调整，本次未单独改动启动环境变量，避免出现 Network 放开但 QueryEngine 仍禁用的半开关状态。

后续建议：

- 由 agent 侧确认是否需要开启 thinking 输出。
- 如果要前端始终看到完整 ReAct 轨迹，需要让底层 stream 持续产出 `thinking` block。
- Network 已经可以接收、合并、返回这些 block。

## 2. Agent 多模态结果需要遵守 Network 输出约定

Network 已支持如下多模态结果：

- `image`
- `audio`
- `video`
- `html`
- `app`
- `file`

可通过 `generatedFiles` 或 skill `outputFiles` 返回：

```ts
{
  path?: string;
  url?: string;
  kind: 'image' | 'audio' | 'video' | 'html' | 'app' | 'file';
  title?: string;
  mimeType?: string;
  sizeBytes?: number;
}
```

如果底层 agent 没有返回该结构，也没有把文件落到 `Network/user/{userId}/*_generated` 目录，Network 无法凭空知道生成结果。此部分属于 agent 侧协议协作，不在本次 Network-only 修改范围内。

## 3. 前端展示需要消费新字段

Network 的 `POST /threads/:id/messages` 和 `GET /threads/:id/messages` 现在可返回：

- `reasoning`
- `media`
- `actions`
- `artifact_id/artifactId`

前端需要按以下方式展示：

- `reasoning`: 展示为思考轨迹，不展示工具调用参数和工具返回。
- `media.kind=image`: 图片预览。
- `media.kind=audio`: 音频播放器。
- `media.kind=video`: 视频播放器。
- `media.kind=html`: 可打开页面或 iframe。
- `media.kind=app`: 打开返回的 app URL。
- `actions.kind=open_artifact`: 打开对应 artifact。

如果前端仍只读取旧的 `reply/file` 字段，多模态 artifact 已存储但不会完整展示。

## 4. TypeScript 完整检查的既有限制

本次执行了以下静态检查：

- 改动文件 TypeScript `transpileModule` 检查：通过，输出 `TRANSPILE_SYNTAX_OK`。
- 完整 `tsc -p backend/src/Network/tsconfig.server.json --noEmit --incremental false`：已执行，但失败在大量既有工程配置/模块解析问题上。

完整 tsc 的主要既有问题类型：

- Network 及非 Network 文件存在 extensionless import，在 `moduleResolution: nodenext` 下报 `Cannot find module` 或需要显式扩展名。
- 非 Network 的 TSX 文件被解析但当前 Network tsconfig 未设置 JSX。
- 非 Network 存在若干既有类型错误和 `MACRO` 全局名缺失。

这些问题不是本次 Network 业务逻辑修改引入的，但会阻止用当前 tsconfig 获得干净的完整工程类型检查结果。
