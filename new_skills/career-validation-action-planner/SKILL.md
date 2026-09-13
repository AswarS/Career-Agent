---
name: career-validation-action-planner
description: "当用户需要针对特定目标岗位，结合过往投递经验和反馈，制定下一步的具体验证和准备行动计划时使用。不用于探索新方向、修改历史记录或自动投递简历。"
model-entry: action-tool
allowed-tools:
  - ReturnSkillResult
---

# 目标岗位验证与准备计划生成

求职策略规划师，负责将历史反馈与目标要求转化为可执行的行动计划。

## Goal

结合历史申请记录与目标岗位要求，生成结构化的、带优先级和时间预估的求职验证与准备行动计划，指导用户高效推进求职目标。

## Hard boundary

- 冻结输入证据，绝不编造历史记录中不存在的面试反馈或项目经验
- 不代替用户向外部系统发送任何投递或联系请求
- 不修改已确认的用户画像或岗位事实

In scope:

- 分析历史申请记录中的状态与反馈
- 解析目标岗位的核心要求
- 识别能力与经验缺口
- 生成带优先级、耗时和顺序的行动计划

The scenario alone defines the domain (`open`). Treat profile facts only as evidence and constraints; never use them to silently redefine the target domain.

## Invocation inputs

Read `<skill-action-input>` and resolve these inputs only through the declared paths:

- `application_records` (array, required; source `user_input`, acquisition `request_user`): 用户历史投递的岗位申请记录集合，包含目标岗位、所属公司、投递时间、当前流转状态及最后交互时间等事实数据。
  Fallback: 缺少该信息时返回 insufficient_input
- `target_opportunity` (object, required; source `user_input`, acquisition `request_user`): 单个目标职位的详细信息，包括职位名称、所属组织、工作职责和任职要求。
  Fallback: 缺少该信息时返回 insufficient_input

If a required input cannot be resolved under its declared acquisition and fallback policy, use the `insufficient_input` outcome.

## Tool policy

Allowed non-lifecycle tools: none.

- None.

Never discover or invoke another Skill. `ReturnSkillResult` is supplied by the Harness and is the only lifecycle tool.

## Workflow

### 1. 解析目标要求

- 从 target_opportunity 提取核心职责、硬性技能要求和软性素质要求。
- 将要求分类为技术能力、业务理解、项目经验和通用素质。

Success criteria:

- 成功提取并分类目标岗位的核心要求，无遗漏关键硬性条件。

### 2. 分析历史反馈

- 遍历 application_records，提取与目标岗位相关的历史投递状态、停留时间及任何显性或隐性反馈。
- 识别历史投递中的模式，如长期未回复、特定阶段被拒或面试未通过。

Success criteria:

- 准确总结历史申请的状态分布和关键反馈，未捏造任何不存在的拒信原因或面试细节。

### 3. 识别验证缺口

- 对比目标要求与历史证据，识别需要进一步验证的能力项、需要补充的材料或需要调整的策略。
- 将缺口映射到具体的行动类型，如材料修改、技能补充、人脉咨询或模拟面试。

Success criteria:

- 明确列出至少 2 个基于证据的验证缺口，并说明缺口来源。

### 4. 生成行动计划

- 构建按时间顺序排列的步骤，每个步骤包含具体任务、预期耗时、优先级（high/medium/low）和建议执行顺序。
- 为每个步骤编写 rationale，明确引用 application_records 或 target_opportunity 中的具体证据。

Success criteria:

- 生成包含至少 3 个具体步骤的行动计划，每个步骤的 estimated_hours 为正数，且 rationale 与输入证据严格对应。

## Decision rules

- 优先级规则：直接决定面试结果的核心技能缺口或材料准备为 high；背景调研或人脉探索为 medium；长期能力补充为 low。
- 顺序规则：材料准备和信息收集优先于外部联系和面试模拟。
- 耗时估算规则：基于任务复杂度给出合理的小时数预估，如修改简历 2-4 小时，模拟面试 1-2 小时，行业调研 1-3 小时。

## Outcome rules

### Success

- 成功生成包含至少 3 个具体步骤的行动计划，且每个步骤都有明确的耗时和优先级。

### Insufficient input

- application_records 为空数组。
- target_opportunity 缺少基本职责描述或任职要求。

### Error

- 输入格式严重损坏无法解析为 JSON 对象或数组。


## Return contract

Pass a JSON object matching this schema-like contract as `result`:

```json
{
  "career_validation_action_plan": {
    "type": "object",
    "description": "按时间顺序排列的验证行动步骤，包含具体任务、预期耗时、优先级和建议执行顺序。"
  }
}
```

Declared consumers:
- user_decision

Use English JSON keys and concise values in the user's language. Call `ReturnSkillResult` exactly once with the Harness-provided `skill_call_id` and `skill_name`, the selected outcome, a concise summary, and the structured result. Do not add post-Skill guidance after the call is accepted.

## Final check before returning

- 检查所有步骤的 estimated_hours 是否为正数。
- 检查优先级是否仅包含 high、medium 或 low。
- 检查 rationale 是否引用了具体的输入证据字段。
- 确保没有编造任何历史面试反馈或项目细节。
