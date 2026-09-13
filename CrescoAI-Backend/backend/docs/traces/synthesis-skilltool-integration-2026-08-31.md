# Synthesis SkillTool 接入与实机测试轨迹

日期：2026-08-31  
工作区：`D:\组内杂活\career\Career-Agent`  
目的：保留 run 选择、代码变更、失败、修复和最终网页结果，供后续检查与复现。

## 1. 输入 run 审计

被选中的 run：

| Run ID | 状态 | 直接校验 | 产物数 |
|---|---|---:|---:|
| `run-20260823-165955-deepseek-v4-flash-7fba96f1` | completed | passed | 15 |
| `run-20260823-192809-deepseek-v4-flash-974940c2` | completed | passed | 18 |
| `run-20260823-201947-deepseek-v4-flash-c3208bed` | completed | passed | 17 |

合计：50 个 SkillTool。

以下 run 只有 input validation，`run_status=in_progress`、`next_stage=task_synthesis`，没有 generated-skills，因此没有安装：

- `run-20260827-194634-deepseek-v4-flash-62d27ad0`
- `run-20260827-194844-deepseek-v3-2-instruct-5c6cfebb`
- `run-20260827-195131-glm-5-3-4e49e87b`
- `run-20260827-195423-qwen3-8-max-d3f11587`

## 2. 兼容性审计

对 50 个产物的检查结果：

- Skill name 无重复；
- Tool name 无重复；
- 189 个输入字段全部使用 factory 支持的类型：170 个 `json`、17 个 `string`、2 个 `number`；
- 50 个配置都包含 Lab-only 的 `child_tools`；
- 50 个配置最初都是 `preserve_existing=true`；
- 50 个配置最初都是 `always_load=true`；
- `child_tools` 只涉及 WebSearch/WebFetch，且与各自 SKILL frontmatter 声明一致。

结论：业务契约可接入，但必须经过规范化，不能原样复制后直接运行 factory。

## 3. 实现轨迹

1. 新增 `scripts/install-synthesis-run-skills.ts`。
2. 增加 `skill-tools:install-runs` package script。
3. dry-run 成功识别 3 个合格 run 和 50 个产物。
4. 写入 repository root `skills/<skill-name>/`。
5. 每个技能写入 `synthesis-source.json`，保留 run 来源。
6. 运行现有 factory，生成 50 个 TypeScript Action Tool adapter。
7. 更新 `generatedSkillActionTools.ts` 和 `generatedSkillActionToolNames.ts`。
8. 重启后端，日志显示 50 个新技能全部 loaded。
9. 将新 Tool 改为 deferred，解决全部 schema 常驻造成的首轮延迟。
10. 将 OpenAI compatibility 的 tool-reference follow-up 从强制 `required` 改为 `auto`，兼容不接受 thinking mode 强制 tool choice 的提供商。

## 4. 会话测试轨迹

所有记录都保存在当前 Career Agent 数据库中，可以从网页打开。

### 4.1 首次 eager-loading 测试

- 会话：`77afce7d-1a8c-47ca-991d-570d6e09e10d`
- 标题：Synthesis SkillTool 实机测试
- 模型：DeepSeek-V4-Flash
- 请求：直接调用 `ExploreCareerDirections`
- 结果：主请求长时间停留在 `Assistant is thinking...`。
- 判断：55 个常驻 Action Tool schema 对普通网页会话不合适。
- 处理：50 个新 Tool 改为 `always_load=false`。

网页：`http://127.0.0.1:4173/threads/77afce7d-1a8c-47ca-991d-570d6e09e10d`

### 4.2 ToolSearch 强制选择兼容错误

- 会话：`60d7dada-cd0f-4561-b92e-a55904bdebf2`
- 标题：Deferred SkillTool 实机测试
- 模型：DeepSeek-V4-Flash
- 已完成：`ToolSearch` 返回 `ExploreCareerDirections` 的 tool reference。
- 错误：提供商返回 HTTP 400，thinking mode 不支持 `tool_choice=required/object`。
- 修复：tool-reference 紧邻下一轮只暴露已引用 schemas，但使用 `tool_choice=auto`。

网页：`http://127.0.0.1:4173/threads/60d7dada-cd0f-4561-b92e-a55904bdebf2`

### 4.3 DeepSeek-V4 完整 Tool 生命周期

- 会话：`091e6225-288f-4d70-b570-346078c0af63`
- 标题：SkillTool 完整链路复测
- 模型：DeepSeek-V4-Flash
- Tool 调用：`ToolSearch → ExploreCareerDirections`
- 客户端观察：非流式测试调用在 240 秒时超时。
- 服务端最终状态：随后完成并持久化。
- Tool result：`skill_name=explore-career-directions`、`execution_status=completed`、`outcome=success`。
- 结果：返回一个“数据分析师”候选方向及证据、不确定性和来源说明。

这条记录证明客户端超时不等于 Skill 执行失败；结果应以服务端消息历史和 lifecycle result 为准。

网页：`http://127.0.0.1:4173/threads/091e6225-288f-4d70-b570-346078c0af63`

### 4.4 DeepSeek-V3.2 对照

- 会话：`44db3df3-6a0f-4968-9e15-14b937affc33`
- 标题：SkillTool 生命周期验收
- 模型：DeepSeek-V3.2-Instruct
- Tool 调用：`ToolSearch → CheckMaterialFormatCompliance`
- 结果：Tool 调用已发起，但在检查窗口内没有持久化 lifecycle result。
- 用途：作为模型差异对照，不计为最终成功验收。

网页：`http://127.0.0.1:4173/threads/44db3df3-6a0f-4968-9e15-14b937affc33`

### 4.5 最终成功验收

- 会话：`c0d2efd7-f5d5-459c-ac51-a2b4d3ba745e`
- 标题：GLM SkillTool 生命周期验收
- 模型：GLM-5.3
- Tool 调用：`CheckMaterialFormatCompliance`
- Tool result：
  - `skill_name=check-material-format-compliance`
  - `execution_status=completed`
  - `outcome=success`
  - summary：resume.pdf 为 PDF、1 页，满足 PDF 且不超过 2 页的要求，整体判定 compliant。
- 最终 assistant message：Markdown 表格，包含格式、页数、命名、语言和要求来源。

网页：`http://127.0.0.1:4173/threads/c0d2efd7-f5d5-459c-ac51-a2b4d3ba745e`

## 5. 自动化验证记录

最终定向测试：

```text
16 pass
0 fail
59 expect() calls
```

覆盖：

- OpenAI compatibility adapter；
- Skill Action Tool factory；
- Action Skill child tool preload；
- Skill registry。

额外观察：

- isolation 测试中的 Windows symlink case 因当前账户没有创建 symlink 权限而得到 EPERM，其他 isolation case 通过；这不是本次接入引入的逻辑失败。
- 全仓 TypeScript 检查存在大量既有错误，包括 shim 的 `.ts` import、恢复源码类型缺口和可选 telemetry 包缺失；本次新增路径由运行时加载和定向测试验证。

## 6. 精简与去重记录

在首次 50 个 SkillTool 全量接入和实机链路验收后，进行第二轮调用面审计。由于当前没有生产流量遥测，“低频”判断采用 ToolSearch 意图重叠、入口参数可获得性、上下游工件依赖和通用模型可直接完成程度，不伪装成真实用户调用统计。

- core profile 保留：32 个 synthesized SkillTool。
- 合并退役：18 个；原始文件仍保存在 synthesis runs，可用 `--profile all` 恢复。
- 典型合并：三个 outreach 起草工具收敛到 `DraftContactMessage`；机会比较收敛到 `RankOpportunitiesToPursue`；回复摘要收敛到 `FollowupPrioritization`；角色背景收敛到 `UnderstandRealWorkProfile`；缺失材料检查收敛到 `BuildSubmissionChecklist`。
- 保留 `CheckMaterialFormatCompliance`，因为它既是高可理解的直接用户意图，也是最终实机成功链路。
- core profile 将合成 Tool 的入口字段设为 optional，缺失检查留给 forked Skill 的生命周期结果，避免 ToolSearch 命中后因多个上游工件必填而无法调用。
- `synthesis-skill-curation.json` 固化 retained、retired、merged_into、reason 和 search hint 覆盖。
- importer `--prune` 和 factory `--prune` 都有来源/生成 marker 保护，不触碰 5 个手写 SkillTool。

退役列表：

```text
check-missing-application-documents
compare-material-requirements
compare-opportunity-targets
compare-roles-or-directions
draft-email-out-of-cover-letter
draft-informational-interview-outreach
draft-outreach-message
evidence-gap-plan
info-conversation-prep
list-unverified-facts-for-supplement
material-prep-planning
outreach-lead-comparison
prepare-informational-questions
prepare-project-showcase-sheet
preview-likely-evaluation-questions
response-digest-synthesis
role-context-brief
translate-application-material
```

## 7. 当前可检查状态

- API：重启后实测返回 38 项，全部为 loaded（37 个本地 Skill + `code-analysis`）。
- Synthesized skills：32 项，每项都有 `synthesis-source.json`；18 项从安装层退役但保留原始 run。
- Generated Tool name registry：37 项（32 个新 adapter + 5 个既有 Action Tool）。
- 新 Tool eager count：0；deferred count：32。
- 合成 Tool 输入字段中 `required=true` 数量：0；业务缺失仍由 Skill lifecycle 校验。
- 前端：`http://127.0.0.1:4173/`，HTTP 200。
- 后端：`http://127.0.0.1:4000/`，正在运行。
- 本地测试用户的模型设置当前为 GLM-5.3；API Key 没有写入本轨迹文件。

## 8. 后续建议

1. 为非流式 `POST /messages` 增加“服务端已完成但 HTTP 收尾迟缓”的回归测试和超时策略。
2. 对 32 个 core SkillTool 按业务域做 ToolSearch top-k 召回评估，再根据真实调用遥测继续精简。
3. 在 Synthesis Lab 完成跨 run 的语义去重后，再导入新批次。
4. 逐个场景抽样验证 `insufficient_input`、`success` 和 `error` 三个生命周期分支。
