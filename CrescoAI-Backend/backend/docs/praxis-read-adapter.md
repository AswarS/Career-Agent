# Praxis Read Adapter（契约 1.0.0）

## 当前状态

Cresco 侧的 `praxis_read` 已按 Praxis 交接包 `praxis-cresco-integration-1.0.0`
实现。Praxis Provider 在交接时仍未部署且默认关闭，因此本功能也使用独立开关，
默认不向模型注册 `praxis_read`。`praxis_open` 不受该开关影响。

冻结契约的运行时副本位于：

- `src/Network/modules/integration/contracts/cresco-read-response.schema.json`
- `src/Network/modules/integration/contracts/cresco-error-response.schema.json`
- `src/Network/modules/integration/contracts/cresco-open-target.schema.json`

这些文件来自交接包 1.0.0。升级时应整体替换、运行 Praxis 官方契约校验器并更新
双方版本，不能只放宽本地校验。

## Tool 与 Adapter 边界

模型只可提交 `view`、`selectionKey`、`sectionKey`、`query`。工具支持六个视图：

- `workspace_overview`
- `project_overview`
- `run_context`
- `submission_result`
- `run_report`
- `artifact_evidence`

项目、Run、Submission ID，用户身份、toolCallId、traceId、分页游标和凭据均由
Cresco 服务端管理，不能进入模型参数。Adapter 使用当前 Career 账号的
`publicUserId` 作为 JWS `sub`，并在服务端维护 `(publicUserId, conversationId,
Praxis base URL)` 维度的 selection 绑定；账号/Token 版本也参与隔离，因此注销或
账号状态版本变化后不会复用旧绑定。

每次 HTTP 尝试都会创建新 `jti`；同一工具调用的 `toolCallId` 和 RFC 8785 JCS
请求体保持不变。Token 绑定 POST 方法、固定路径、请求体 SHA-256 和 toolCallId，
最长有效期 60 秒。Provider 成功响应在通过冻结 JSON Schema 和 scope 校验后，
直接成为工具结果，不再映射为第二套 DTO。

默认每个用户轮次只允许一次读取。仅允许以下两步链：

- `workspace_overview` → `run_context`
- `submission_result` → `artifact_evidence`

证据文本属于不可信数据；工具描述明确要求忽略其中的指令。Adapter 已禁止把超长
结果落入通用 Tool 文件存储，并禁止把原始结果写入画像/业务存储。需要注意：当前
QueryEngine 的 JSONL transcript 会统一保存 Tool 结果，因此交接契约要求的“原始
结果仅保留当前授权轮次”还需要一次独立的平台级 transcript 脱敏改造；在完成该项
之前，不应宣称 retention conformance 已通过，也不应在生产环境打开 Read 开关。

## 配置

Praxis Provider 可用后，在启动 Cresco 后端前配置：

```bash
export CAREER_AGENT_PRAXIS_INTEGRATION_ENABLED=true
export CAREER_AGENT_PRAXIS_READ_ENABLED=true
export CAREER_AGENT_PRAXIS_BASE_URL=http://localhost:8000
# 可选；默认复用上面的 Praxis base URL
export CAREER_AGENT_PRAXIS_READ_BASE_URL=http://localhost:8000
# 可选，100–30000 毫秒，默认 5000
export CAREER_AGENT_PRAXIS_READ_TIMEOUT_MS=5000
```

Read Token 复用现有 Cresco SSO 签名密钥和公开 JWKS，但使用固定 audience
`praxis-read-api` 以及不同的请求绑定 claims。生产环境仍须配置 HTTPS issuer、
Praxis HTTPS 地址和正式私钥；开发环境可使用现有的临时 ES256 密钥。

若只启用 `CAREER_AGENT_PRAXIS_READ_ENABLED` 而未启用总体 Praxis 集成，配置会
直接报错，避免出现工具已注册但 JWKS/身份链未启用的半配置状态。

## 主要代码与测试

- Tool schema/提示词：`src/Network/modules/integration/praxis.tools.ts`
- HTTP、JWS、scope/selection、预算：`src/Network/modules/integration/praxis-read.client.ts`
- Provider 响应校验：`src/Network/modules/integration/praxis-read.contract.ts`
- 配置：`src/Network/modules/integration/praxis-integration.config.ts`
- Agent 注册：`src/Network/modules/agent/agent.service.ts`
- Tool 测试：`tests/praxis-tools.test.ts`
- Adapter 测试：`tests/praxis-read-client.test.ts`

在 Provider 未部署阶段可运行契约与 mock HTTP 测试；真实双端联调需要 Praxis Draft
Provider 合并并启动后，再打开 `CAREER_AGENT_PRAXIS_READ_ENABLED`。
