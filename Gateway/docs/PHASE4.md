# 阶段四：Ask_User_Question 与 User 模拟终端

## 配置与自动执行

先按 PHASE2 配置后端 harness，按 PHASE3 配置主 Agent 模型代理。另行配置 User 模型：

```powershell
$env:GATEWAY_USER_MODELS_JSON = '{"simulated-user":{"provider":"openai","baseUrl":"http://127.0.0.1:8000/v1","apiKey":"<User模型凭据>","model":"<User模型名称>"}}'
node Gateway/src/server.ts
```

支持 `openai` 和 `anthropic`。配置格式与主 Agent 模型一致，但名称空间和凭据独立，允许使用不同服务。样例 `Gateway/examples/task.json` 已包含 `userSimulator.modelProfile=simulated-user`。
配置 harness 后，任务引用未配置的 User 模型会在创建时返回 400；仅登记模式仍允许登记未来模型名称。

执行流程：

1. 后端产生待回答的 `ask_question`，保存原 toolUseId 并进入 waiting_user。
2. Gateway 轮询取得当前问题和用户可见历史，向 User 模型发出非流式 API 请求。
3. 校验返回的 answers，将答案回填到当前 run 绑定的用户、会话和原 toolUseId。
4. 原工具继续执行，不创建新的对话或替代用户消息；模型下一回合可见正常工具返回。

`userSimulator=true` 能力表示已配置 harness 和至少一个 User 模型，不代表外部服务连通性已验证。`userTerminal=true` 表示已配置 harness。

## 提示词与回答格式

User 模型输入包括初始 **Profile + Query**、主会话已完成的用户可见文本块、先前问题和答案、当前 questions（question/header/multiSelect/options）。
不读取模型原始轨迹、thinking/status、文件工具返回、子 Agent 内部对话、评分答案或后端更新后的隐藏状态。
Profile/Query 使用任务初始值；历史来自当前会话的内存事件投影，不开启 Conversation Memory。

系统提示要求保持用户身份和历史回答一致，未知个人事实明确说明未提供，不替 Agent 完成任务、不输出推理，只返回：

```json
{"answers":{"希望在哪个城市工作？":"上海"}}
```

键必须是每个问题的完整原文；每题恰好一条非空字符串，单条最多 10000 字符。不接受遗漏题目、额外键、空白答案或任意 Markdown 包装。
支持自由文本，故不会强制答案必须来自选项；多选沿用原工具的逗号分隔字符串约定。
当前每次工具请求支持 1–4 个问题，重复问题文本因键冲突而拒绝。

User API 请求 `stream=false`、`max_tokens=2048`；单次最长 60 秒，并受 run 剩余总时限约束。响应体最多 1 MiB。
只接受 OpenAI finish_reason=stop 或 Anthropic stop_reason=end_turn 的完整响应。API 错误、格式错误或截断均使自动运行失败，不编造默认答案、不自动重新采样。

## 外部终端 API

任务设 `userSimulator=null` 时，保留 waiting_user，等待调用方通过 API 回答。
先 `GET /v1/runs/:id` 读取 input.profile、input.query 和 pendingQuestion，再调用：

```http
POST /v1/runs/:id/user-questions/:toolUseId/respond
Authorization: Bearer <GATEWAY_API_TOKEN>
Content-Type: application/json

{"answers":{"希望在哪个城市工作？":"上海"}}
```

成功返回 200 和当前运行记录。未配置 Gateway token 时仍沿用 loopback 模式；部署应配置服务 token。
自动模拟任务也可对同一路由提交 `{}`，与正在执行的模拟请求共用结果；不能用外部答案覆盖自动任务。

| 状态 | 场景 |
| --- | --- |
| 400 | 答案缺失、格式错误或未知 User 模型 |
| 401 | Gateway 服务凭据不正确 |
| 404 | run 不存在 |
| 409 | 原 toolUseId 不匹配、运行不再等待、答案冲突或自动任务被外部覆盖 |
| 500 | 模拟推理、采集或回填失败，响应不泄露配置和原始上游错误 |

内部后端新增 `POST /api/career-agent/training/runs/:id/user-questions/:toolUseId/respond`，使用独立训练服务凭据。由服务按 run 绑定派发到已有 `ConversationService.respondToInteractiveTool`，无需真实用户 JWT。

## 限额、重复请求与取消

- maxUserQuestions 由后端强制，按不同 toolUseId 计数；一次含多题的工具调用计一次，重复事件不重复消耗，0 表示禁止询问。超限为 failed / max_user_questions_exceeded。
- 多个待回答工具请求排队，不用后到的问题覆盖前一个；只有当前问题允许新答案回填。
- Gateway 对相同 run/toolUseId 共用生成及回填 Promise；后端再校验答案内容与归属。相同内容幂等，冲突内容拒绝。
- 回填确认丢失时，Gateway 只用同一份答案重试一次；后端已经接受的答案不会再次执行。两次失败则保留失败结果，自动运行取消后端；不进行无限重试。
- 取消、清理和总时限会中止 User API 请求；中止后不发起新的答案回填。已被后端接受的答案无法撤回。
- 问题和去重状态均在内存中，进程重启后不提供 exactly-once 或运行恢复保证。

## 记录边界与验证

开启阶段三代理时，答案回填前追加 `user.answer` 诊断事件，含 toolUseId、问题、选定答案及来源。它表示已选定且准备递交的答案；实际工具执行仍由后续主 Agent `tool.result` 记录确认。
不把 User 模型请求/响应当成主 Agent 模型轨迹，不消耗 maxModelCalls；User API 凭据不进入运行记录或诊断事件。正式 loss mask/token 导出仍属于阶段五。
未开启代理时可运行模拟终端，但不写阶段三诊断文件。

新增测试覆盖两轮完整问答、双协议、可见历史与隐藏数据隔离、外部 API 鉴权与校验、并发去重、确认丢失重试、0/1 次限额、错误回答、取消及超时。
HTTP 测试使用真实 Gateway 路由、HTTP harness adapter、后端 HarnessCore 和本地模型替身。未启动真实 NestJS/SDK/数据库或调用外部模型；完整联调和静态类型检查仍需依赖完整的环境。
