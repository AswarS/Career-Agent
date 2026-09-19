# 阶段五：轨迹收发、封存与训练 token 导出

## 数据与存储

阶段五默认启用，不增加第三方运行时依赖。继续使用 `GATEWAY_TRACE_DIR`，默认 `Gateway/data/trajectories`。
模型代理、工具结果和模拟用户答案现在写入同一版本化日志。每个 run 使用：

- `<runId>.events.jsonl`：schemaVersion=1.0 的事件封套，包含 eventId、runId、occurredAt、Gateway sequence、receivedAt 和 payload。
- `<runId>.manifest.json`：封存清单、事件数、SHA-256、终态运行快照、训练就绪检查结果。

旧 `<runId>.jsonl` 诊断文件原样保留，不自动迁移；阶段五不会把旧诊断格式默认为完整训练数据。
`GET /v1/runs/:id/trace` 保留兼容的扁平诊断视图，其 trainingReady 仍固定为 false。正式导出使用下述 trajectory 接口。

每次日志追加先 write，再 file.sync，成功后才确认；同一 run 的追加、读取与封存进入串行队列。写入错误会使该进程内的日志保持失败，不能跳过失败事件继续封存。
重新加载未封存日志时，只截去最后一条没有换行的未确认残片；完整行损坏、sequence 不连续、重复 eventId 或封存校验和不一致均拒绝读取。进程恢复后同 eventId 同内容不会重复追加。

部署限制：**一个目录只能由一个 Gateway 写入进程管理**。当前没有跨进程锁、多副本协调、日志压缩、配额或自动清理；读取时会将单个 run 的日志载入内存。
manifest 通过临时文件 sync 后 rename 发布；没有承诺所有操作系统/文件系统在断电时都能保留目录项。运行执行状态、用户工具等待和后端绑定不因日志恢复而自动恢复。

## 接口

这些接口沿用 Gateway API Bearer token。loopback 未配置 token 时仍允许本地调用，因此应仅信任本机调用方；对外部署必须设置 GATEWAY_API_TOKEN。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| POST | `/v1/runs/:id/trajectory-events` | 接收一条生产方事件；返回存储后的事件及 sequence |
| GET | `/v1/runs/:id/trajectory-events?after=0&limit=1000` | 返回 events、nextCursor、finalized；after 是排除式 sequence，limit=1..1000 |
| GET | `/v1/runs/:id/trajectory` | 完整事件、manifest、samples、trainingReady 和 reasons |
| POST | `/v1/runs/:id/finalize` | 无请求体；等待本地执行/回答/代理写入结束并封存 |

读取 events 时发送 `Accept: text/event-stream` 可获得**有限分页 SSE 回放**：每条含 `id: <sequence>`、`event: trajectory`；页末为 checkpoint 事件并关闭连接。调用方用 nextCursor 或 Last-Event-ID 继续获取，不是永久订阅连接。
不存在的轨迹返回 404；非法事件/游标/token 数组返回 400；冲突事件、未知 token 关联、运行尚未结束或封存后新写入返回 409。相同 eventId 且封套内容相同的重试返回原 sequence，封存后也可确认同一事件；occurredAt 必须保持不变。

阶段五存储的已封存轨迹支持 Gateway 重启后按 runId 读取、分页及重复 finalize，不依赖 RunStore。未恢复执行状态的未封存日志可以读取检查，但不能通过 HTTP 继续写入或伪造终态封存。

## 生产方事件

接受 `model.request`、`model.response`、`tool.call`、`tool.result`、`training.tokens`。`run.finished` 和 gateway. 前缀 eventId 由 Gateway 保留。
模型事件必须标明原 runId、gatewaySessionId、requestId、agentId=`main:<gatewaySessionId>`、agentRole=main、purpose=policy、无父 Agent，协议为 openai/anthropic。工具事件同样要求主 Agent 标识。
请求 body 必须为对象；响应必须包含 protocol、status、complete，其他原始捕获字段可以保留。工具事件字段见 contracts.ts。子 Agent 身份或保留 Conversation Memory 标记会被拒绝。

内置代理已自动记录模型及工具事件，外部生产方**不要重复上报这些事件**。该接口主要供推理适配器补交 token 数据；另一种用途是接入不经过内置代理的受信主 Agent 采集器。

```json
{
  "schemaVersion": "1.0",
  "eventId": "engine-tokens-request-001",
  "runId": "<原runId>",
  "occurredAt": "2026-09-19T00:00:00.000Z",
  "payload": {
    "type": "training.tokens",
    "requestId": "<原requestId>",
    "tokens": {
      "source": "inference_engine",
      "modelVersion": "policy-checkpoint-001",
      "tokenizerVersion": "tokenizer-001",
      "tokenIds": [10, 11, 12],
      "promptTokenCount": 2,
      "lossMask": [0, 0, 1],
      "logprobs": [null, null, -0.2]
    }
  }
}
```

上例的数字仅说明格式，不能用于真实训练。生产方必须提交推理引擎实际产生的数组。主 Agent 请求上游时会携带 `x-gateway-run-id` 和 `x-gateway-request-id`，用于与 journal 中的请求关联；session token 不转发给上游。
生产方用 Gateway 服务凭据调用事件入口；该凭据不会随推理请求发给模型服务。事件请求大小受 GATEWAY_MAX_MODEL_BODY_BYTES 限制。

每次 requestId 只接收一组 token 数据；必须已有对应的主 Agent request。tokenIds 是「本次完整输入前缀 + 本次实际生成后缀」，promptTokenCount 必须准确指向边界。输入中的系统提示、历史、工具结果和模拟用户答案均属前缀，lossMask=0、logprobs=null；仅新生成后缀 lossMask=1，并有有限、非正的实际 logprob。
拒绝估算来源、缺版本、长度不一致、非法 token、全输入无生成、给输入加 loss 等数据。不会从文本重新分词，也不会用 usage 冒充实际 token 数组。
当前接入是受信推理生产方协议；Gateway 不能独立证明生产方提交的 token 确实来自声称的 checkpoint，也未内置特定 vLLM/SGLang 等服务的 token 提取实现。

## 封存与训练就绪

completed 与 finalized 分开：运行进入 completed/failed/cancelled/timed_out 后，生产方先确认所有事件（尤其 token）已收到 ACK，再调用 finalize。
finalize 会追加 Gateway run.finished、计算校验和并发布不可变 manifest。所有已排队写入均先于封存；封存后到达的新事件拒绝。缺数据也可以封存为诊断归档，之后不能再补写，应在封存前查询检查结果。

只有同时满足以下条件，导出才返回 trainingReady=true：

- 已封存且运行 completed，至少有一条主 Agent request。
- 每个请求恰好一个完整成功响应，协议一致、顺序正确；没有孤立响应或 token 数据。
- 每个请求都有且只有一组有效 engine token 数据；同一轨迹的 modelVersion/tokenizerVersion 一致。
- 工具调用和结果完整，无重复或颠倒，且没有 capture.rejected / limit.exceeded 事件。

失败、中断、缺 token、漏工具结果等会在 reasons 中说明。samples 按每次请求导出真实 token 数组，不拼接不同回合或不同请求的 token。该标记是数据完整性检查，不替代训练方的奖励计算、策略版本鉴权或 on-policy 一致性验证。
capabilities 中 trajectoryIngest/trajectoryExport/trajectoryFinalization/durableTrajectoryStorage/trainingTokenIngest 为 true；persistentStorage（运行执行恢复）和 trainingTokens（内置推理服务原生提取）仍为 false。

## 验证范围

测试覆盖事件去重冲突、并发顺序、封存屏障、重启读档、断行恢复、损坏拒绝、写入失败、token/mask 校验、主 Agent 过滤、完整性判断、鉴权 HTTP 和分页 SSE。
本地模型与运行终态使用测试替身；真实 NestJS/数据库/推理引擎 token 接入及静态类型检查仍需完整依赖环境验证。阶段六继续完成真实端到端验证与一键训练流程。
