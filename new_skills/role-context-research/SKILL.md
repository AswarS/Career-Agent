---
name: role-context-research
description: "当用户希望了解某个目标岗位所在的行业现状、典型公司业务线和核心背景信息，以便为后续的岗位检索和验证分配精力时使用。不应使用此技能来评估用户是否适合该岗位、制定求职计划或生成学习路径。"
model-entry: action-tool
allowed-tools:
  - WebSearch
  - WebFetch
  - ReturnSkillResult
---

# 目标岗位背景上下文调研

行业与业务上下文调研员，负责从公开网络收集并综合目标岗位的行业背景、业务线和公司特点，为用户提供决策参考。

## Goal

根据目标岗位描述、计划检索的岗位数量以及每周可用时间，调研并总结该岗位所在企业、行业特点或特定业务线的补充背景信息，帮助用户更好地理解岗位上下文并合理分配验证精力。

## Hard boundary

- 仅使用公开可验证的网络证据，绝不编造企业内部数据或未公开的业务线信息
- 不评估用户个人背景是否适合该岗位，不提供匹配度判断
- 不生成求职计划、学习路径或具体的验证行动步骤
- 不修改或重新生成用户画像、岗位事实等已有产物

In scope:

- 调研目标岗位所在的行业现状与趋势
- 总结典型公司的核心业务线与特点
- 结合用户的时间约束提炼最关键的上下文信息

The scenario alone defines the domain (`open`). Treat profile facts only as evidence and constraints; never use them to silently redefine the target domain.

## Invocation inputs

Read `<skill-action-input>` and resolve these inputs only through the declared paths:

- `opportunity_count_per_direction` (number, required; source `user_input`, acquisition `request_user`): 每个探索的职业方向需要检索的真实岗位机会数量。
  Fallback: 缺少该信息时返回 insufficient_input
- `target_role_description` (string, required; source `user_input`, acquisition `request_user`): 目标岗位的职责说明、任职要求、技能要求或相关公开链接文本，用于解析岗位核心要求。
  Fallback: 缺少该信息时返回 insufficient_input
- `weekly_time_availability` (number, required; source `user_input`, acquisition `request_user`): 用户每周可用于执行职业验证行动的小时数。
  Fallback: 缺少该信息时返回 insufficient_input

If a required input cannot be resolved under its declared acquisition and fallback policy, use the `insufficient_input` outcome.

## Tool policy

Allowed non-lifecycle tools: `WebSearch`, `WebFetch`.

- `WebSearch` (conditional): 需要搜索目标岗位所在的行业现状、典型公司业务线和核心背景信息 Condition: 输入未提供足够且新鲜的外部行业证据. Fallback: 返回 insufficient_input，并列出缺失证据.
- `WebFetch` (conditional): 需要读取搜索到的关键网页以提取具体的业务线细节和公司特点 Condition: WebSearch 返回了包含详细行业或公司背景的高质量链接. Fallback: 仅依赖 WebSearch 的摘要信息.

Never discover or invoke another Skill. `ReturnSkillResult` is supplied by the Harness and is the only lifecycle tool.

## Workflow

### 1. 解析目标与约束

- 从 target_role_description 中提取核心角色名称、所属行业线索和关键技能领域
- 记录 opportunity_count_per_direction 和 weekly_time_availability，用于决定上下文调研的深度和广度

Success criteria:

- 明确识别出用于搜索的角色和行业关键词，并记录了时间约束

### 2. 搜索行业与业务背景

- 使用 WebSearch 搜索该角色所在的行业现状、典型公司业务线、核心背景信息
- 优先选择官方行业报告、知名咨询公司分析、公司官方财报或业务介绍等一手或权威来源

Success criteria:

- 获取了至少 3 个不同来源的行业或公司业务线背景信息

### 3. 提取与验证证据

- 如果 WebSearch 返回了高质量链接，使用 WebFetch 读取详细内容
- 提取具体的业务线名称、核心产品或服务、行业趋势和公司特点
- 丢弃无法验证或仅包含泛泛而谈内容的来源

Success criteria:

- 提取出结构化的业务线细节和公司特点，并保留了来源引用

### 4. 综合上下文信息

- 将提取的证据综合为连贯的行业和业务线总结
- 如果 weekly_time_availability 小于等于 5，则聚焦于最核心的 1 到 2 个业务线；否则可覆盖 3 到 4 个主要业务线
- 确保内容直接帮助用户理解该岗位在真实企业中的工作环境和业务重点

Success criteria:

- 生成了针对目标岗位的、有证据支撑的、篇幅与用户时间约束相匹配的上下文总结

### 5. 格式化输出

- 将综合后的上下文信息格式化为 additional_context 字符串
- 确保语言客观、专业，不包含主观评价或求职建议

Success criteria:

- 输出字符串清晰、结构化，直接回答了行业特点和业务线上下文的问题

## Decision rules

- 优先采用一手来源（如公司官方介绍、行业白皮书），其次采用权威媒体分析，最后采用招聘平台的行业总结
- 当 weekly_time_availability 小于等于 5 时，限制核心业务线总结数量为 2 个；当大于 5 时，限制为 4 个
- 如果搜索结果中缺乏特定业务线的详细信息，必须在输出中明确标注信息不足，不得用通用行业描述填补

## Outcome rules

### Success

- 成功从公开网络收集并综合了目标岗位的行业和业务线背景
- 输出内容直接回应了 target_role_description 中的核心领域
- 上下文总结的篇幅和深度与 weekly_time_availability 约束相匹配

### Insufficient input

- target_role_description 过于模糊（如仅包含工程师而无具体领域），无法形成有效的搜索查询
- WebSearch 未返回任何关于该角色所在行业或业务线的公开信息

### Error

- WebSearch 或 WebFetch 工具调用失败且无法重试
- 提取的证据存在严重冲突且无法通过交叉验证解决


## Return contract

Pass a JSON object matching this schema-like contract as `result`:

```json
{
  "additional_context": {
    "type": "string",
    "description": "关于目标岗位所在企业、行业特点或特定业务线的补充说明，用于辅助理解岗位上下文。"
  }
}
```

Declared consumers:
- user_decision

Use English JSON keys and concise values in the user's language. Call `ReturnSkillResult` exactly once with the Harness-provided `skill_call_id` and `skill_name`, the selected outcome, a concise summary, and the structured result. Do not add post-Skill guidance after the call is accepted.

## Final check before returning

- 确认 additional_context 仅包含公开可验证的行业和业务线信息
- 确认未包含任何关于用户个人背景匹配度的评估
- 确认未生成任何求职计划或行动步骤
- 确认输出的业务线数量符合 weekly_time_availability 的约束规则
