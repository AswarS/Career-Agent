# Career-Agent Token 优化与同轨迹消融报告

日期：2026-09-13

## 1. 结论

本次修改针对两类反复纳入模型上下文的成本：全量 Skill Action schema，以及 Harness 在父、子 Agent 之间重复执行的记忆工作。改动已落到运行时，不只是改 prompt。

使用库中现有轨迹做同数据消融后，得到：

- 历史真实基线：13 个主轨迹、864 次带供应商 `usage` 的模型调用，共处理 34,898,654 input token 和 316,674 output token，合计 35,215,328 token。
- 其中主轨迹为 14,856,017 token，69 个 Skill Action 子轨迹为 20,359,311 token。子轨迹占全部已记录 token 的 57.8%，是首要问题，不是边角开销。
- 按当前 38 个 Action Tool schema 重建请求体，普通轮次的 schema 估算从 7,933 token 降到 783 token，每轮减少约 7,150 token，降幅 90.1%。
- 在主轨迹原有 267 次调用的顺序上回放，保留 4 次 ToolSearch 紧随调用必须暴露的被选 schema，其余 263 次移除 deferred schema，估算减少 1,880,450 input token，等于主轨迹 input 的 12.78%，或全部主+子轨迹 input 的 5.39%。这是不改变调用次数时的可量化下界。
- 子轨迹中发现 14 次 Action Tool 再入调用，并出现最深 34 层的 `<skill-invocation-protocol>` 累积。深度大于 1 的轨迹已记录 2,660,793 token。新的子 Agent 工具白名单会阻止这类未声明的 Skill 再入；这部分会改变执行路径，因此单列为结构性收益，不与 1,880,450 直接相加宣称精确节省。

## 2. “真实”与“估算”的边界

本报告使用了两类数据：

1. **真实基线**：直接累加现有 JSONL 轨迹中模型供应商返回的 `input_tokens` / `output_tokens`，不是按字符数猜测。
2. **反事实消融**：固定同一批轨迹、调用顺序和 ToolSearch 命中位置，只对 schema/prompt 载荷做移除。schema token 采用仓库分析器的跨模型估算法（CJK 约 1 token/字，其他文本约 4 字符/token），所以是可复现估算，不是账单精度。

本次没有使用对话中暴露的 API key 发起新付费调用。原因是该 key 已出现在明文对话中，应视为已泄露凭据；同时请求未指定要对照的 endpoint、model 和采样参数。直接消耗该 key 无法构成可复现实验，也会扩大凭据风险。应立即撤销/轮换该 key；如需新的 A/B 付费实验，应使用新 key，并固定 endpoint、model、temperature、seed（如支持）与输入集。

## 3. 同数据消融设计

### A0：历史基线

输入是 `backend/src/Network/user/1/transcripts` 下的 13 个主 JSONL 和其 `subagents/*.jsonl`。主轨迹分析产物保存在 `tmp/trajectory-token-baseline.json`。

| 范围 | 轨迹文件 | API 调用 | Input | Output | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| 主轨迹 | 13 | 267 | 14,714,036 | 141,981 | 14,856,017 |
| Skill Action 子轨迹 | 69 | 597 | 20,184,618 | 174,693 | 20,359,311 |
| 合计 | 82 | 864 | 34,898,654 | 316,674 | 35,215,328 |

所有基线调用的 cache creation/read 均为 0，说明工具 schema、历史和重复 prompt 没有被供应商 prompt cache 吸收。

### A1：仅隐藏 deferred Action schema

保持历史调用次数与顺序不变。对普通请求只保留 5 个 `always_load` schema；ToolSearch 返回 `tool_reference` 后的紧随请求仍传送被引用 schema。

| 指标 | A0 | A1 | 变化 |
| --- | ---: | ---: | ---: |
| 普通轮次 Action schema | 7,933 | 783 | -7,150（-90.1%） |
| 主轨迹 processed input | 14,714,036 | 12,833,586（估算） | -1,880,450（-12.78%） |
| 主轨迹调用数 | 267 | 267 | 0 |

这一结果故意不计子 Agent 工具池缩减、递归调用消失和重复记忆查询消失，因此是保守下界。

### A2：子 Agent 工具池白名单

旧实现只在 `canUseTool` 层做权限拒绝，但仍把全部工具和 schema 传入子 Agent。轨迹中因此可见：

- 子 Agent 出现 14 次 Action Tool 调用：`CareerCompetencyModel` 7 次、`ExploreCareerDirections` 4 次、`BaselineAssessment` 3 次。
- 还暴露了大量非声明工具：`Read` 192、`Edit` 64、`Write` 49 次等。
- 递归协议深度最高达 34；深度大于 1 的子轨迹已消耗 2,660,793 token。

新实现在建立子 Agent 前就将工具池收缩到 Skill `allowed-tools` 和隐式生命周期工具 `ReturnSkillResult`。这不仅减少 schema，还使未声明的 Action Skill 根本不可见，从源头阻断轨迹中的再入链。

### A3：记忆 Harness 去重与压缩

修改包含：

- Action Skill 子 Agent 标记为 `agent:skill-action`，不再执行一次 `startRelevantMemoryPrefetch`。父轨迹 fork 已包含当轮选中记忆，子 Agent 的再查询是重复工作。
- Session Memory 单节上限从 2,000 降到 400 token，总上限从 12,000 降到 4,000 token。
- 默认更新 prompt 从 3,471 字符（约 868 token）缩到 818 字符（约 205 token），静态降幅 76.4%。
- 不再要求记忆复制“完整、精确”的交付物，改为摘要+产物引用，避免后续每轮重传大段输出。

现有轨迹没有将记忆 prefetch 作为可独立归类的子 JSONL 保存，因此本报告不虚构其历史 token 节省值。上述 76.4% 仅是记忆更新 prompt 本身的静态对比，实际还需在新轨迹中单独记录 `querySource` 和 side-query usage 后验证。

## 4. 已实施修改

| 位置 | 修改 | 目的 |
| --- | --- | --- |
| `backend/src/services/api/openAICompatibility.ts` | OpenAI-compatible 请求不再把 `defer_loading: true` 的 Anthropic Tool 转成普通 function schema；ToolSearch 紧随请求只暴露命中工具 | 让 deferred schema 在兼容网关上真正不计入每轮 payload |
| `backend/src/skills/skillAction.ts` | 子 Agent 工具池改为 `allowed-tools + ReturnSkillResult` | 同时解决 schema 泄漏、误调用和 Action Skill 递归 |
| `backend/src/skills/forkedSkillExecutor.ts` / `backend/src/query.ts` | Action 子 Agent 使用专用 `querySource`，跳过重复记忆 prefetch | 避免父子 Harness 对同一轮再做一次记忆选择 |
| `backend/src/services/SessionMemory/prompts.ts` | 压缩更新 prompt 与记忆预算 | 降低固定 prompt 税和后续轮次的历史膘胀 |
| `skills/tailored-resume-generator/*` | Action Tool 改为 deferred，`SKILL.md` 从 5,914 压到 3,966 bytes（-32.9%） | 用一个真实 Skill 验证渐进披露和去重复编写 |

`tailored-resume-generator` 的取舍是：它在全局低频时延迟加载更省 token；但在明确要生成简历的单次会话中，首次命中可能多一次 ToolSearch 往返。后续应用线上命中率决定是继续 deferred，还是由轻量意图路由器预加载，而不应对所有会话常驻。

## 5. 验证结果

- 定向单元/集成测试：29 项通过。
- 另有 1 项 Windows symlink 测试因 `EPERM` 失败，是当前环境没有创建符号链接权限，不是断言失败。
- `bun run skill-tools:plan` 成功，识别 38 个 Action Tool，`tailored-resume-generator` 按预期保留手写工具。
- 通用 skill validator 在 Windows 默认 GBK 下先遇到编码问题；使用 UTF-8 后又因项目自定义 frontmatter `model-entry` 不在通用 validator 白名单而拒绝。仓库自身的 Skill Action factory dry-run 已通过。
- 全库 `tsc --noEmit` 仍有大量已存在的重建源码/缺失依赖错误，不能作为本次改动的干净基线。

## 6. 未解决风险与下一步

1. 子 Agent 仍会 fork 父会话上下文。轨迹中单次 input 可达 160,557 token，后续应将 Action Skill 的 fork 内容改成“Skill 指令 + 结构化输入 + 必要 artifact 摘要”，而不是全历史复制。
2. 网关监控应额外记录 `querySource`、可见工具数、schema bytes、是否 ToolSearch follow-up、父/子 skill call id。这样新 A/B 轨迹才能把 schema、memory side-query 和业务上下文分开计费。
3. 应在固定模型上运行一组新的 paired replay，同时比较质量指标：Skill 成功率、ToolSearch 往返数、生命周期正常关闭率、输出 contract 通过率和总 token。只看 token 可能会隐藏质量回归。
4. 撤销对话中暴露的 API key，后续用新 key 通过环境变量/密钥管理注入，不写入命令、日志、报告或仓库。

## 7. 复现命令

```powershell
cd CrescoAI-Backend/backend
bun run trajectories:tokens --user-id 1 --top 20 --json ../../tmp/trajectory-token-baseline.json
bun run skill-tools:plan
```

注：历史主轨迹分析器目前不递归扫描 `subagents/`，所以只看它的终端汇总会少计 20,359,311 token。本报告已对子 JSONL 中的 provider `usage` 单独累加。
