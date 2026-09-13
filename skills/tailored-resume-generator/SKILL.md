---
name: tailored-resume-generator
description: "当用户希望基于 Profile 或提供的真实经历生成基础简历，或针对目标岗位/方向优化现有简历时使用。输出可下载、可打印的简历，并保留事实溯源与待确认项；不编造经历，不代用户投递。"
model-entry: action-tool
allowed-tools:
  - ReturnSkillResult
---

# 生成或优化定制简历

基于 Profile 或用户材料生成 `tailored_resume`；有目标岗位或方向时按相关度优化。外层 Harness 负责校验、渲染、保存和发布。

## 事实边界

- 只能使用 `application_materials`、`resume_draft` 和 `user_profile` 中明确存在的用户事实。
- 不得新增或放大数字、成果、角色、技能熟练度、任职时间、学历或证书。
- 目标岗位或职业方向中的要求不是用户事实；无证据要求只能进入 `facts_needing_confirmation`。
- 有冲突的事实不得静默选择，必须排除出正文并列入待确认项。
- 不写文件、不声称文件已生成；只返回结构化内容。
- 不执行投递、发送或修改外部系统状态。

## Inputs

从 `<skill-action-input>` 与当前对话取值。`application_materials`、`resume_draft`、`user_profile` 是事实来源，至少一项须含可用事实，否则返回 `insufficient_input`。`career_direction_exploration_results` 与 `target_opportunity` 仅提供目标要求；都缺失时生成通用基础简历。`format_preferences` 可指定语言、篇幅、标题和版式；未指定则沿用材料语言和简洁单栏版式。

## Workflow

1. 建立带 `source_ref` 的事实账本，隔离冲突内容。
2. 有目标时将要求映射为 `matched`、`partial` 或 `missing`，并按“硬性要求强证据、核心职责可迁移证据、加分项、低相关内容”排序；无目标时令 `match_analysis` 为空，优先最近、具体且有代表性的事实。
3. 生成简洁、ATS 友好的正文。bullet 使用“动作 + 对象/问题 + 方法 + 已有结果”；没有数字就如实描述产出。`professional_summary` 与 `skills` 不得超出事实账本。
4. 审计每个 bullet 的非空 `source_refs`；冲突、缺失证据和仅来自岗位要求的声明进入 `facts_needing_confirmation`，不进入正文。
5. 按契约组装对象并调用一次 `ReturnSkillResult`。默认约一至两页信息密度，不用表格、图标、进度条或多栏布局。

## Return contract

成功时，`result` 必须是以下结构，不要 JSON 字符串化：

```json
{
  "tailored_resume": {
    "document_title": "string",
    "candidate": {"name": "string", "headline": "string", "contact_lines": ["string"]},
    "professional_summary": "string",
    "sections": [
      {
        "section_type": "experience|projects|education|skills|certifications|other",
        "title": "string",
        "entries": [
          {
            "heading": "string",
            "subheading": "string",
            "date": "string",
            "location": "string",
            "bullets": [{"text": "string", "source_refs": ["string"]}]
          }
        ]
      }
    ],
    "match_analysis": [{"requirement": "string", "status": "matched|partial|missing", "source_refs": ["string"], "note": "string"}],
    "facts_needing_confirmation": [{"claim": "string", "reason": "string", "source_refs": ["string"]}],
    "fact_boundary_declaration": "string"
  }
}
```

允许空字符串和空数组表示材料缺项，但不得省略顶层字段。`sections` 至少有一个非空条目，每个正文 bullet 的 `source_refs` 非空。返回对象，不要 JSON 字符串化。

## Outcomes

- `success`：结构完整、至少一个正文条目、所有 bullet 可溯源、事实审计通过。
- `insufficient_input`：Profile、基础材料和现有简历均没有足够事实形成任何正文条目。
- `error`：输入无法解析，或无法在事实边界内形成任何简历正文。
