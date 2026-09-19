# Gateway 测试 cases

这 5 个 JSON 可直接作为 `POST /v1/runs` 的请求体。来源为相邻目录 `task_environment_packages_llm_5/packages`，原始文件未改动。

| Case 文件 | 测试内容 | 初始材料数 |
| --- | --- | --- |
| application_document_audit.json | 简历、求职信、项目证据一致性审计 | 3 |
| career_direction_validation.json | 企业数字化与供应链方向比较、四周计划 | 0 |
| learning_progress_review.json | 学习证据评估与有条件更新状态 | 1 |
| opportunity_resume_tailoring.json | 上海 B2B SaaS 岗位调研与简历定制 | 2 |
| resume_edit_fact_preserving.json | 简历精确替换与其他内容原样保留 | 1 |

## 转换规则

- 保留原始任务 ID、任务正文，补充公开任务的可用输入、约束、交付要求及相对路径说明。
- `workspace.files` 内嵌全部 7 份 UTF-8 材料，逐份核对源清单的 SHA-256 与字节数。`/workspace/materials/...` 映射为 `materials/...`，由后端写入该次运行用户的真实 workspace。不同任务的同名文件保持独立。
- Profile 转为训练后端实际支持的 `career_profile_v1`；教育、工作、项目、技能、求职意向分别映射到对应字段，全部 `learning.*` 保存到 `planState.learningPlan`。为避免旧输入结构丢失产品 v2 画像字段，`artifacts.resumeSummary` 还保留完整 `base_profile`、`product_fields` 原值。该兼容方式保留事实，但不等同于逐字段导入产品 v2 状态；学习状态更新效果仍需真实运行验证。
- 主模型配置名为 `main-policy`，模拟用户配置名为 `simulated-user`。需在 Gateway 配置中存在对应名称；不在 case 中写入 API 密钥。模拟用户由 Gateway 接收 Profile 与 Query，任务没有被强行追加提问要求。
- 每例默认超时 10 分钟、最多 100 次模型调用、20 次用户提问。Conversation Memory 关闭及仅捕获主 Agent 轨迹由 Gateway 策略控制。
- `index.json` 是评估与溯源索引，包含公开验收标准、材料校验信息；不应作为任务提交或放入 Agent workspace。源包中的 private、metadata、invocation_bindings 等内部文件不进入请求。
- 岗位定制任务需要真实招聘信息检索能力；未替换为虚构招聘材料。职业方向任务原本没有附件，保留空 workspace 初始文件列表。

## CMD 使用

### Python 自动批跑（推荐）

先按已有流程启动后端及新版 Gateway，然后运行：

```cmd
python C:\git\Career-Agent\Gateway\scripts\batch_test_cases.py
```

仅使用 Python 标准库，无需 pip 安装。脚本顶部写死项目路径、Gateway 地址、5 个 case 文件、输出目录、轮询及超时时间，不需要命令行参数或 CMD 环境变量。访问令牌可填写顶部 `API_TOKEN`；默认从固定路径 `C:\git\Career-Agent\Gateway\.env.training` 读取 `GATEWAY_API_TOKEN`，不会打印凭据。

脚本先检查就绪状态，再顺序执行 5 例，每例完成后导出并默认封存。失败后继续下一例；等待超时会尝试取消已知 run。创建请求不自动重试，避免产生重复用户和推理费用；`creationUnconfirmed=true` 时需检查服务端是否已创建。Ctrl+C 会尝试取消当前已知 run 并保存报告，不继续下一例。

结果保存在 `Gateway/data/batch-tests/<时间戳-随机后缀>/`，每例目录包含：

- `messages_list.json`：直接可读取的消息数组。
- `messages.json`：`{runId, messages_list}` 文档。
- `trajectory.json`：带 issues、tools、trainingReady 等信息的完整消息导出。
- `input.json`、`created.json`、`run.json`、`result.json` 和成功封存后的 `manifest.json`。

根目录 `report.json` 汇总结果。退出码 0 表示所有任务执行完成且消息导出无 issue；1 表示任务/导出失败或中断；2 表示启动或输出错误。该结果不代替 `index.json` 中的业务验收，也不要求真实 token 的 trainingReady 为 true。默认保留用户 workspace；如需等待后续 token 上报，先将顶部 `FINALIZE_AFTER_RUN` 改为 `False`，避免提前封存。

### 手动提交

从项目根目录重新生成并离线校验（会覆盖本目录生成的 JSON）：

```cmd
cd /d C:\git\Career-Agent
node Gateway\scripts\convert-example-packages.ts
```

按已有真实环境流程启动后端与 Gateway 后，在另一 CMD 中提交一例（端口按实际配置调整，令牌填写 `.env.training` 中的 `GATEWAY_API_TOKEN`；CMD 不会自动加载该文件）：

```cmd
set "GATEWAY_API_TOKEN=填写你的Gateway访问令牌"
curl --fail-with-body -X POST "http://127.0.0.1:8787/v1/runs" -H "Authorization: Bearer %GATEWAY_API_TOKEN%" -H "Content-Type: application/json" --data-binary "@Gateway\examples\cases\resume_edit_fact_preserving.json"
```

其他 case 只需替换文件名。每次 POST 都创建独立 run、用户、会话及 workspace；相同 taskId 可以重复采样。提交成功不代表任务已经完成，使用返回的 runId 按 `Gateway/docs/API.md` 查询运行状态与轨迹。

这里推荐直接 POST：`run-training.ts` 是环境验收流程，会向 query 追加读文件证明和提问要求，因此不适合忠实执行这些原始任务，尤其是精确替换任务。

已完成 Gateway 请求格式、后端训练输入、源材料 SHA-256 / 字节一致性离线校验；尚未提交这些 case 或调用模型，尚无任务成功率结论。
