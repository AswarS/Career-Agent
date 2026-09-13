# Synthesis Run → SkillTool：可扩展接入说明

## 1. 当前实现

Career Agent 现在有一条确定性的离线接入链路：

```text
skilltool-synthesis-lab/runs/<run-id>/generated-skills/*
  → install-synthesis-run-skills.ts
  → repository-root/skills/*
  → generate-skill-action-tools.ts
  → backend/src/tools/*Tool + generated registries
  → Nest/Agent runtime
  → ToolSearch 延迟发现
  → forked Action Skill execution
  → ReturnSkillResult
  → conversation API / web UI
```

核心脚本：

- `scripts/install-synthesis-run-skills.ts`：跨 run 选择、校验、合并、规范化、安装和来源记录。
- `scripts/generate-skill-action-tools.ts`：已有 factory，根据 `SKILL.md + action-tool.json` 生成静态 Tool adapter 和注册表。
- `src/services/api/openAICompatibility.ts`：OpenAI-compatible 模型的 ToolSearch/tool reference 适配。

入口命令已经加入 `package.json`：

```powershell
bun run skill-tools:install-runs --help
bun run skill-tools:plan
bun run skill-tools:generate
bun run skill-tools:sync-core
```

## 2. 为什么不能直接复制 generated-skills

Synthesis Lab 与当前 factory 存在三处契约差异：

1. Lab 的 `action-tool.json` 含 `child_tools`，factory 使用严格 schema，不接受该字段。
2. Lab 产物统一带有 `preserve_existing: true`，但新合成技能并没有对应的手写 Tool 文件；原样使用会产生错误的保留语义。
3. Lab 产物统一带有 `always_load: true`。一次合并几十个技能后，每轮都发送所有 Tool schema，会显著增加输入 token、首轮延迟和提供商失败概率。

导入器执行以下规范化：

- 验证 `child_tools` 与 `SKILL.md` 的 `allowed-tools` 一致，然后从安装后的配置中去掉 `child_tools`；子工具权限仍由 `allowed-tools` 控制。
- 将新产物的 `preserve_existing` 设为 `false`，让 factory 创建 adapter。
- 默认将 `always_load` 设为 `false`，利用 `search_hint + ToolSearch` 延迟发现。
- 默认使用 `synthesis-skill-curation.json` 的 core profile，未经过分类的新 Skill 会阻止安装，避免规模再次无审查膨胀。
- core profile 将 Action Tool 的入口字段改为可选；Skill 仍负责验证业务输入并在不足时返回 `insufficient_input`，因此网页对话不必先拼齐整条上游工件链才能调用。
- 保留 `SKILL.md`、`skilltool.json`、测试用例，并为每个技能写入 `synthesis-source.json`。

## 3. 批量安装与扩展

### 3.1 只生成计划

不带 `--write` 时不会写文件：

```powershell
cd CrescoAI-Backend/backend
bun run skill-tools:install-runs
```

默认扫描 runs root，只选取同时满足以下条件的 run：

- `run_status == completed`
- `summary.quality_status == direct_validation_passed`
- 存在 `generated-skills/`

### 3.2 安装合格 run 的核心 Skill 集

```powershell
bun run skill-tools:install-runs --write --update-existing --prune
bun run scripts/generate-skill-action-tools.ts --write --prune
```

以上两步也可以直接运行 `bun run skill-tools:sync-core`。

默认 `--profile core`。精简决策、合并目标和 ToolSearch hint 覆盖保存在 `scripts/synthesis-skill-curation.json`。

需要复现实验室全部 50 个产物时使用：

```powershell
bun run skill-tools:install-runs --profile all --write --update-existing
bun run skill-tools:generate
```

### 3.3 精确选择并合并多个 run

`--run-id` 可以重复：

```powershell
bun run skill-tools:install-runs `
  --run-id run-a `
  --run-id run-b `
  --write
bun run skill-tools:generate
```

不同 run 中出现相同 Skill name 或 Tool name 时，导入器拒绝继续，要求先在 synthesis 层完成去重或显式选择。

### 3.4 更新已安装产物

```powershell
bun run skill-tools:install-runs --write --update-existing
bun run skill-tools:generate
```

安全规则：`--update-existing` 只更新包含 `synthesis-source.json` 且来源 `run_id` 相同的目录。它不会覆盖手写 Skill，也不会用另一个 run 静默替换现有 Skill。

`--prune` 只删除来自本次选中 run、且带 `synthesis-source.json` 的退役 Skill。factory 的 `--prune` 只删除带生成文件 marker 的过期 Tool 目录；两者都不会删除手写 Skill/Tool。

### 3.5 自定义路径

```powershell
bun run skill-tools:install-runs `
  --runs-root D:\path\to\runs `
  --skills-dir D:\path\to\runtime-skills `
  --write
```

`--always-load` 可恢复 eager loading，但只建议用于数量很小、每轮都必须可见的核心 Tool。

## 4. 校验门

导入器在写入前完成全部检查：

- run 已完成并通过 direct validation；
- Skill 目录名、frontmatter `name` 和命名规则一致；
- `model-entry` 为 `action-tool`；
- Tool 名符合 factory 规则；
- `child_tools` 与 `allowed-tools` 一致；
- 合并集合内 Skill name 和 Tool name 唯一；
- 目标目录不存在，或满足安全更新规则。

写入完成后，再由 factory 严格验证：

- action Tool input 仅使用 `string / number / boolean / json`；
- Tool 名不冲突；
- 手写 Tool 不被覆盖；
- 生成 TypeScript adapter、Tool 注册表和隐藏内部工具结果所需的名称注册表。

## 5. 部署与验证流程

```powershell
cd CrescoAI-Backend/backend

# 1. 计划和安装
bun run skill-tools:install-runs
bun run skill-tools:install-runs --write

# 2. 生成 adapter
bun run skill-tools:plan
bun run skill-tools:generate

# 3. 运行相关测试
bun test tests/openai-compatibility.test.ts `
  tests/skill-action-tool-factory.test.ts `
  tests/skill-action-tool-preload.test.ts `
  tests/skill-registry.test.ts

# 4. 重启后端
$env:CAREER_AGENT_SKIP_AUTH = 'true'
$env:CAREER_AGENT_SKIP_AUTH_USER_ID = '1'
bun run network:dev
```

验证 API：

```powershell
Invoke-RestMethod http://127.0.0.1:4000/api/career-agent/skills
```

网页入口：`http://127.0.0.1:4173/`。

## 6. Scaling 特性与边界

导入阶段的扫描、校验和写入成本与 run 数和技能数线性相关。实验室产物不需要逐个编写 adapter；factory 对 core 或 all profile 统一生成。

默认延迟加载避免 Tool 数量线性增加每轮模型上下文。模型先调用 `ToolSearch`，运行时只在紧邻的下一轮暴露被引用 Tool 的完整 schema。

目前的明确边界：

- 当前历史批次的语义去重由版本化 curation policy 完成；更理想的上游方案仍是在 Synthesis Lab 生成阶段完成语义聚类。
- `quality.status` 在这些历史 run 中仍为 pending；本次采用的是 Lab 已声明的 `direct_validation_passed`，并补充运行时实机测试，不等同于完成全量人工业务验收。
- 非流式消息 POST 可能在服务端已经保存最终消息后仍等待较久；网页使用消息流/历史刷新可以看到结果，但该响应收尾延迟值得单独优化。
- 整仓 `tsc --noEmit` 当前存在大量接入前已有错误；本次以 factory、兼容层、预加载和注册表的定向测试作为回归门。

## 7. 当前安装状态（2026-08-31）

- 完整且直接校验通过的源 run：3 个。
- 源产物：50 个；core profile 安装的 synthesized SkillTool：32 个，退役并可恢复的重复/低频工具：18 个。
- 本地 Skill 目录：37 个（32 个合成 + 5 个手写）；运行时技能 API 预期 38 个（另含 `code-analysis`）。
- 新增 32 个 Tool 均为 deferred（`always_load=false`），入口字段经过 core profile 放宽以提高实际可调用性。
- 模型连接：DeepSeek-V4-Flash、DeepSeek-V3.2-Instruct、GLM-5.3 均验证过；最终验收使用 GLM-5.3。
- 前端 `4173` 与后端 `4000` 正在运行。

完整操作与会话证据见 `docs/traces/synthesis-skilltool-integration-2026-08-31.md`。

## 8. 按文件夹安装或卸载单个本地 Skill

`new_skills` 中的单个目录可以直接作为安装输入。两个命令默认只输出计划，必须显式传入
`--write` 才会修改文件。安装命令会去掉 Lab-only 的 `child_tools`、默认将 Tool 设为
deferred、放宽入口必填字段，并同步生成 Tool adapter 与注册表。

```powershell
cd CrescoAI-Backend/backend

# 预览安装
bun run skill-tools:install-one --skill-path "D:\path\to\new_skills\skill-name"

# 执行安装
bun run skill-tools:install-one --skill-path "D:\path\to\new_skills\skill-name" --write

# 预览卸载；输入必须是 runtime skills 下的已安装目录
bun run skill-tools:remove-one --skill-path "D:\path\to\skills\skill-name"

# 执行卸载，同时刷新注册表并清理生成型 Tool
bun run skill-tools:remove-one --skill-path "D:\path\to\skills\skill-name" --write
```

默认只允许卸载带 `local-skill-source.json` 来源标记、由单项安装脚本安装的 Skill。确需
删除其他 action-tool Skill 时必须额外传入 `--allow-unmanaged`。安装已有目录时，只有来源
标记匹配的目录可以通过 `--update-existing` 更新。
