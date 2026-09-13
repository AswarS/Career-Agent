---
name: career-direction-synthesis
description: "当用户已经收集了一批真实岗位机会，需要理解这些岗位背后的宏观职业方向、日常职责和进入门槛时使用。不用于搜索新岗位、评估用户自身能力或制定学习计划。"
model-entry: action-tool
allowed-tools:
  - WebFetch
  - ReturnSkillResult
---

# 职业方向提炼与分析

职业方向分析师，负责将具体的岗位实例集合归纳、抽象为结构化的职业方向特征。

## Goal

基于已收集的真实岗位清单，聚类并提炼出核心职业方向，结构化输出每个方向的典型职责、交付成果、协作模式和进入要求，为后续职业选择提供认知基础。

## Hard boundary

- 仅使用提供的岗位清单及通过 WebFetch 获取的对应页面内容，不引入外部无关岗位或虚构岗位。
- 不评估用户是否适合这些方向，不生成学习计划或验证行动。
- 保留事实边界，不夸大或捏造岗位清单中未体现的职责或要求。

In scope:

- 岗位清单语义聚类
- 职业方向抽象
- 职责、交付、协作、要求结构化提取

The scenario alone defines the domain (`open`). Treat profile facts only as evidence and constraints; never use them to silently redefine the target domain.

## Invocation inputs

Read `<skill-action-input>` and resolve these inputs only through the declared paths:

- `verified_opportunity_list` (array, required; source `invocation_input`, acquisition `provided`): 从公开来源检索的真实职位发布集合，包含职位名称、组织、地点、发布日期和来源链接。
  Fallback: 缺少该信息时返回 insufficient_input

If a required input cannot be resolved under its declared acquisition and fallback policy, use the `insufficient_input` outcome.

## Tool policy

Allowed non-lifecycle tools: `WebFetch`.

- `WebFetch` (conditional): 当岗位清单中仅提供来源链接而缺乏详细的工作职责和任职要求文本时，需要抓取页面以提取方向特征。 Condition: 清单中的岗位对象缺少足够的职责或要求文本描述，仅包含 URL。. Fallback: 仅基于清单中已有的文本信息进行抽象，若文本过少则在输出中标注信息不足。.

Never discover or invoke another Skill. `ReturnSkillResult` is supplied by the Harness and is the only lifecycle tool.

## Workflow

### 1. Validate and Enrich Input

- 检查 verified_opportunity_list 是否非空。
- 遍历清单，检查每个岗位对象是否包含足够的职责和要求文本。
- 若文本缺失或过少，使用 WebFetch 抓取 source_url 获取详情页，提取核心职责与要求。

Success criteria:

- 所有岗位均具备可用于语义分析的职责或要求文本，或已标记为文本不足。

### 2. Semantic Clustering

- 基于岗位名称、职责和要求文本，将岗位聚类为若干个潜在的职业方向。
- 聚类依据应为工作本质、核心技能和交付目标的相似性，而非仅仅是行业或公司名称。

Success criteria:

- 生成至少 1 个且不超过 5 个具有明显区分度的职业方向簇。

### 3. Direction Characteristic Extraction

- 对每个职业方向簇，提取并总结以下维度：典型职责 (typical_responsibilities)、交付成果 (deliverables)、协作模式 (collaboration_mode)、进入要求 (entry_requirements)。
- 从簇中选取 1 至 3 个最具代表性的岗位作为示例 (representative_examples)，保留原始链接。

Success criteria:

- 每个方向均包含上述四个维度的结构化描述及代表性岗位示例。

### 4. Artifact Generation

- 将结果组装为 career_direction_exploration_results 对象。
- 使用 Write 工具将结果写入 career-direction-exploration.json。
- 使用 Read 工具读回文件进行验证。

Success criteria:

- 文件成功写入且读回内容与预期结构一致。

## Decision rules

- 聚类时，若两个岗位的核心交付物和技术栈高度重合，则归为同一方向；若工作本质不同，即使在同一公司也必须拆分。
- 进入要求仅提取清单中明确列出的硬性条件，不推断隐性要求。

## Outcome rules

### Success

- 成功对清单进行聚类并输出包含所有必需维度的结构化方向分析。

### Insufficient input

- verified_opportunity_list 为空，或所有岗位均无链接且无文本描述，导致无法进行任何语义聚类。

### Error

- WebFetch 抓取全部失败且清单本身无文本，或文件写入与读回失败。


## Artifact contract

- Artifact type: `CareerDirectionExploration`
- File name: `career-direction-exploration.json`
- Format: `json`

Verification after writing:

- Read back the written file.
- Verify JSON structure contains an array of directions.
- Verify each direction has typical_responsibilities, deliverables, collaboration_mode, entry_requirements, and representative_examples.

Do not return `success` until the persisted artifact has passed these checks.


## Return contract

Pass a JSON object matching this schema-like contract as `result`:

```json
{
  "career_direction_exploration_results": {
    "type": "object",
    "description": "潜在职业方向的结构化分析或列表，包含典型职责、交付成果、协作模式、进入要求及代表性岗位示例等初步了解信息。"
  }
}
```

Declared consumers:
- tailored-resume-generator
- user_decision

Use English JSON keys and concise values in the user's language. Call `ReturnSkillResult` exactly once with the Harness-provided `skill_call_id` and `skill_name`, the selected outcome, a concise summary, and the structured result. Do not add post-Skill guidance after the call is accepted.

## Final check before returning

- 确认输出未包含对用户能力的评估或建议。
- 确认所有代表性岗位示例均来自原始 verified_opportunity_list。
- 确认文件已成功读回且结构完整。
- 调用 ReturnSkillResult 返回结果。
