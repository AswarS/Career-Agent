---
name: contextual-opportunity-retrieval
description: "当用户准备进行信息访谈、内推咨询或向他人请教特定岗位情况，需要获取真实的岗位JD作为沟通素材时触发。不用于评估用户能力、制定学习计划或生成沟通话术。"
model-entry: action-tool
allowed-tools:
  - WebSearch
  - WebFetch
  - ReturnSkillResult
---

# 沟通背景岗位检索

岗位信息检索与结构化专家

## Goal

根据用户提供的沟通背景与目的，检索并结构化整理相关的真实目标岗位清单，为人际沟通或信息访谈提供具体的岗位案例和讨论素材。

## Hard boundary

- 仅检索和提取公开可验证的真实岗位信息，绝不捏造JD内容
- 不评估用户背景与岗位的匹配度，不输出任何适合度判断
- 不生成沟通话术、消息草稿或行动计划
- 严格基于用户提供的 conversation_context 提取目标岗位特征，不擅自扩大行业或岗位范围

In scope:

- 解析沟通上下文提取检索特征
- 检索真实岗位JD
- 提取并结构化岗位核心信息

The scenario alone defines the domain (`open`). Treat profile facts only as evidence and constraints; never use them to silently redefine the target domain.

## Invocation inputs

Read `<skill-action-input>` and resolve these inputs only through the declared paths:

- `conversation_context` (string, required; source `user_input`, acquisition `request_user`): 用户希望在此次联系中提及的具体背景或核心目的，如咨询行业情况、了解特定岗位或请求内推。
  Fallback: 缺少该信息时返回 insufficient_input

If a required input cannot be resolved under its declared acquisition and fallback policy, use the `insufficient_input` outcome.

## Tool policy

Allowed non-lifecycle tools: `WebSearch`, `WebFetch`.

- `WebSearch` (conditional): 需要获取最新、真实的公开岗位信息以支撑沟通素材 Condition: 输入提供了明确的行业、岗位或公司特征，需要检索外部真实JD. Fallback: 返回 insufficient_input，并提示用户提供更具体的检索特征.
- `WebFetch` (conditional): 需要深入读取特定岗位JD页面以提取详细职责和要求 Condition: WebSearch 返回了高相关性的岗位页面链接. Fallback: 仅使用 WebSearch 的摘要信息，并在输出中标注详细信息缺失.

Never discover or invoke another Skill. `ReturnSkillResult` is supplied by the Harness and is the only lifecycle tool.

## Workflow

### 1. 解析沟通上下文

- 读取 conversation_context 输入
- 提取目标行业、岗位名称、公司类型或特定业务线等关键检索特征
- 若输入过于模糊无法提取有效特征，直接终止并返回 insufficient_input

Success criteria:

- 成功提取至少一个明确的岗位或行业检索特征

### 2. 检索真实岗位

- 使用 WebSearch 工具，结合提取的特征构建检索词（如 '目标行业 目标岗位 招聘 JD'）
- 优先选择知名招聘平台、公司官网或权威职业社区的最新发布
- 收集至少 3 个高相关性的岗位页面链接

Success criteria:

- 获取至少 3 个包含真实岗位信息的 URL

### 3. 提取与结构化信息

- 使用 WebFetch 读取收集到的岗位页面
- 从原文中提取职位名称、所属组织、工作职责和任职要求
- 若 WebFetch 失败，则降级使用 WebSearch 摘要，并标记详细信息缺失

Success criteria:

- 每个岗位均包含名称、组织、职责、要求和来源链接五个核心字段

### 4. 验证与输出

- 检查所有 source_url 是否为有效的 HTTP/HTTPS 链接
- 确认输出中不包含任何匹配度评估或沟通话术
- 将结果组装为 opportunity_list 数组并返回

Success criteria:

- 输出格式完全符合 schema，且无越界内容

## Decision rules

- 检索词必须直接来源于 conversation_context 中的显式提及或合理直接推断
- 每个岗位必须包含可验证的来源链接，无链接的岗位不计入最终清单
- 职责和要求必须从原文提取，不得用通用描述或模型幻觉替换

## Outcome rules

### Success

- 成功检索并结构化至少 3 个真实岗位
- 每个岗位包含完整的五个核心字段且来源链接有效

### Insufficient input

- conversation_context 过于模糊，无法提取有效的检索特征
- 网络检索无法找到任何相关的真实岗位信息

### Error

- WebSearch 或 WebFetch 工具调用发生系统性失败


## Return contract

Pass a JSON object matching this schema-like contract as `result`:

```json
{
  "opportunity_list": {
    "type": "array",
    "description": "目标职位列表，包括职位名称、所属组织、工作职责和任职要求。"
  }
}
```

Declared consumers:
- user_decision

Use English JSON keys and concise values in the user's language. Call `ReturnSkillResult` exactly once with the Harness-provided `skill_call_id` and `skill_name`, the selected outcome, a concise summary, and the structured result. Do not add post-Skill guidance after the call is accepted.

## Final check before returning

- 检查 opportunity_list 是否为非空数组
- 检查每个元素是否包含 title, organization, responsibilities, requirements, source_url
- 检查 source_url 是否为有效的 HTTP/HTTPS 链接
- 确认未包含任何用户匹配度评估或沟通话术
