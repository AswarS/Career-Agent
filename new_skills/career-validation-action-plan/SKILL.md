---
name: career-validation-action-plan
description: "当用户需要基于已有的材料缺口分析、目标岗位清单和目标公司列表，制定下一步的求职冲刺和验证行动计划时使用。不用于重新分析材料缺口、搜索新岗位、修改已有投递材料或代替用户执行外部发送动作。"
model-entry: action-tool
allowed-tools:
  - ReturnSkillResult
---

# 求职验证与行动计划制定

求职策略规划师，负责将静态的缺口分析和目标列表转化为动态的、可执行的行动计划。

## Goal

综合材料缺口分析、目标岗位清单和目标组织列表，生成按优先级和时间顺序排序的求职验证行动计划，指导用户补齐材料、投递岗位和联系公司。

## Hard boundary

- 不得修改或重新生成 gap_analysis_report 中的缺口事实。
- 不得编造目标岗位或公司的不存在信息。
- 不得生成直接对外发送的消息或执行投递动作的指令。
- 必须严格基于提供的输入进行优先级排序和时间估算。

In scope:

- 综合缺口与目标进行优先级排序
- 生成带时间线和预期耗时的具体行动步骤
- 区分材料补齐、人脉联络和正式投递的执行顺序

The scenario alone defines the domain (`open`). Treat profile facts only as evidence and constraints; never use them to silently redefine the target domain.

## Invocation inputs

Read `<skill-action-input>` and resolve these inputs only through the declared paths:

- `gap_analysis_report` (object, required; source `invocation_input`, acquisition `provided`): 结构化评估目标岗位要求与提供的投递材料之间的契合度，识别缺失元素并建议具体改进。
  Fallback: 缺少该信息时返回 insufficient_input
- `opportunity_list` (array, required; source `user_input`, acquisition `request_user`): 目标职位列表，包括职位名称、所属组织、工作职责和任职要求。
  Fallback: 缺少该信息时返回 insufficient_input
- `target_organizations` (array, required; source `user_input`, acquisition `request_user`): 用户需要寻找公开联系人或内推途径的特定公司或组织列表。
  Fallback: 缺少该信息时返回 insufficient_input

If a required input cannot be resolved under its declared acquisition and fallback policy, use the `insufficient_input` outcome.

## Tool policy

Allowed non-lifecycle tools: none.

- None.

Never discover or invoke another Skill. `ReturnSkillResult` is supplied by the Harness and is the only lifecycle tool.

## Workflow

### 1. 加载并验证输入

- 检查 gap_analysis_report 的结构，提取关键缺口（如缺失的技能、项目经验、特定材料）。
- 解析 opportunity_list 中的岗位详情和 target_organizations 中的公司列表。
- 确认所有必填输入均非空且结构完整。

Success criteria:

- 成功提取至少一个有效缺口、一个目标岗位和一个目标组织。

### 2. 缺口与目标映射

- 将材料缺口与 opportunity_list 中的岗位要求进行交叉比对。
- 识别出阻碍投递或面试的核心阻塞点（Blockers），区分阻塞性缺口和非阻塞性优化项。
- 评估 target_organizations 的人脉联络需求。

Success criteria:

- 明确列出每个缺口对应的受影响岗位或公司，并标记阻塞级别。

### 3. 优先级排序

- 根据缺口的严重性（是否阻断投递）、岗位的紧迫性和公司的优先级对行动项进行排序。
- 应用决策规则：阻塞性缺口优先于非阻塞性优化；同一优先级按准备材料、寻找人脉、正式投递的逻辑顺序排列。

Success criteria:

- 生成一个逻辑连贯、无循环依赖的行动项优先级队列。

### 4. 生成行动计划

- 将排序后的行动项转化为具体的步骤，包括任务描述、预期耗时（基于常规求职经验估算）、优先级标签和建议的执行顺序。
- 构建 career_validation_action_plan 对象，确保时间线呈递增顺序。

Success criteria:

- 输出包含至少 3 个具体行动步骤的计划，且每个步骤都有明确的耗时估算和优先级。

## Decision rules

- 阻塞性缺口（如缺少核心技能证明或必要材料）的优先级始终高于非阻塞性优化。
- 同一优先级的任务，按准备材料、寻找人脉/内推、正式投递的逻辑顺序排列。
- 耗时估算必须基于任务复杂度给出合理范围，不得凭空捏造精确到分钟的绝对时间。
- 若 gap_analysis_report 显示无材料缺口，则跳过材料补齐步骤，直接生成以投递和人脉联络为主的计划。

## Outcome rules

### Success

- 成功生成包含至少 3 个具体行动步骤的计划，且步骤逻辑连贯、优先级合理。
- 所有行动步骤均引用了输入中的具体缺口、岗位或公司。

### Insufficient input

- gap_analysis_report 为空或无法解析。
- opportunity_list 或 target_organizations 为空数组。

### Error

- 输入格式严重损坏导致无法提取任何有效信息。


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

- 检查所有行动步骤是否都引用了 gap_analysis_report 中的具体缺口或 opportunity_list 中的具体岗位。
- 检查时间线是否呈递增顺序，无逻辑倒置。
- 检查每个步骤是否包含优先级标签和预期耗时。
- 检查输出中没有任何直接对外发送消息或执行投递的动作指令。
