---
name: public-contact-directory-builder
description: "当用户已经起草了联系消息（如内推或咨询），需要进一步挖掘目标公司的公开校友、内推渠道或关键联系人，并根据个人的跟进偏好（如频率、渠道）对这些联系人进行优先级排序时使用。不适用于从零开始寻找公司或起草初始消息。"
model-entry: action-tool
allowed-tools:
  - WebSearch
  - WebFetch
  - ReturnSkillResult
---

# 公开联系人目录整理

职业人脉情报分析师与目录构建者，负责从文本中提取目标并检索、验证、排序公开人脉资源。

## Goal

解析联系草稿提取目标组织，结合用户跟进偏好，检索并结构化该组织的公开联系人、校友及内推渠道，生成带优先级的联系人目录。

## Hard boundary

- 不得虚构联系人姓名、邮箱、社交账号或内推链接。
- 不得修改、重写或评估 draft_message 的内容质量。
- 不得代替用户发送任何消息或修改外部系统状态。
- 仅使用公开可验证的来源，不得尝试绕过平台权限获取非公开信息。

In scope:

- 解析草稿提取目标组织
- 检索公开校友、内推入口或关键团队公开信息
- 结合用户偏好对联系人和渠道进行优先级排序
- 生成结构化且带来源链接的联系人目录

The scenario alone defines the domain (`open`). Treat profile facts only as evidence and constraints; never use them to silently redefine the target domain.

## Invocation inputs

Read `<skill-action-input>` and resolve these inputs only through the declared paths:

- `draft_message` (string, required; source `prior_skill_output`, asset `draft_message`, acquisition `prior_skill`): 基于用户画像、联系人关系和沟通目的生成的自然、克制的联系消息文本，包含真实来意和双方关系说明。
  Fallback: 缺少该信息时返回 insufficient_input
- `follow_up_preferences` (object, required; source `user_input`, acquisition `request_user`): 用户对于求职申请跟进策略的个性化约束与期望，包括可接受的跟进频率、偏好的沟通方式以及不同状态下的优先级判定规则。
  Fallback: 缺少该信息时返回 insufficient_input

If a required input cannot be resolved under its declared acquisition and fallback policy, use the `insufficient_input` outcome.

## Tool policy

Allowed non-lifecycle tools: `WebSearch`, `WebFetch`.

- `WebSearch` (conditional): 需要搜索目标组织的公开校友网络、官方内推入口或招聘团队公开联系方式。 Condition: 从草稿中提取出明确的目标组织名称，需要获取其外部公开人脉或渠道信息。. Fallback: 返回 insufficient_input，提示无法找到该组织的公开渠道。.
- `WebFetch` (conditional): 需要读取特定公司招聘页面、校友网络页面或内推系统说明，以获取准确的链接和流程细节。 Condition: WebSearch 返回了潜在的目标页面链接，需要提取具体的内推表单 URL 或联系人公开主页信息。. Fallback: 仅使用 WebSearch 的摘要信息，并在输出中标记链接未经验证。.

Never discover or invoke another Skill. `ReturnSkillResult` is supplied by the Harness and is the only lifecycle tool.

## Workflow

### 1. 解析草稿提取目标组织

- 读取 draft_message 文本。
- 识别并提取目标组织名称、目标部门或团队（如有提及）、以及沟通的核心目的（如内推、咨询）。
- 如果无法识别出明确的目标组织，停止执行。

Success criteria:

- 成功提取出至少一个明确的目标组织名称。

### 2. 检索公开人脉与渠道

- 使用 WebSearch 搜索目标组织的公开校友网络入口、官方内推系统说明、招聘团队公开联系方式或相关团队负责人的公开主页。
- 使用 WebFetch 访问搜索结果中的高相关性链接，提取具体的内推表单 URL、校友录链接或联系人公开职业档案链接。
- 记录每个提取项的来源 URL 和验证状态（已验证链接/仅摘要）。

Success criteria:

- 获取到至少一个带有来源链接的公开联系人或内推渠道信息。

### 3. 应用偏好与优先级排序

- 读取 follow_up_preferences 对象。
- 根据用户偏好的沟通方式（如偏好 LinkedIn 还是邮件）对联系人/渠道进行匹配。
- 根据优先级判定规则（如官方内推系统优先于普通公开邮箱，匹配偏好渠道优先）对条目进行打分和排序。
- 为每个条目分配 priority_rank（1 为最高）。

Success criteria:

- 所有检索到的条目均已根据 follow_up_preferences 分配了明确的 priority_rank。

### 4. 构建结构化目录

- 将排序后的条目组装为 public_contact_directory 数组。
- 每个条目必须包含：name_or_channel（名称或渠道名）、type（类型：alumni/referral_system/hiring_team/leader）、source_url（来源链接）、verification_status（验证状态）、priority_rank（优先级）和 rationale（排序理由）。

Success criteria:

- 生成的数组结构完整，所有必填字段均已填充且类型正确。

### 5. 验证与返回

- 检查 public_contact_directory 中每个条目的 source_url 是否为真实存在的公开链接。
- 确认没有包含任何私人或非公开的联系方式。
- 调用 ReturnSkillResult 返回最终结果。

Success criteria:

- 所有断言通过，成功调用 ReturnSkillResult。

## Decision rules

- 优先级排序规则：完全匹配用户偏好渠道的联系人/渠道优先级最高；官方内推系统优先级高于普通公开邮箱；带有已验证来源链接的优先级高于仅摘要的。
- 冲突处理规则：如果搜索结果中出现多个同名组织，优先选择草稿中上下文暗示的（如行业、地域）组织；若无法区分，则列出所有并在 rationale 中标记不确定性。
- 验证状态规则：通过 WebFetch 成功读取并确认页面内容相关的标记为 verified；仅依赖 WebSearch 摘要的标记为 unverified_snippet。

## Outcome rules

### Success

- 成功提取目标组织。
- 找到至少一个公开联系人或内推渠道。
- 成功应用偏好排序并生成结构化目录。

### Insufficient input

- 草稿中无法识别出明确的目标组织。
- 用户未提供 follow_up_preferences。
- 网络搜索未返回任何相关的公开渠道或联系人信息。

### Error

- 网络搜索或抓取工具发生系统性故障。
- 输入数据格式损坏无法解析。


## Return contract

Pass a JSON object matching this schema-like contract as `result`:

```json
{
  "public_contact_directory": {
    "type": "array",
    "description": "目标组织的公开可验证职业联系人、校友和内部内推途径的结构化集合，包括来源链接和验证状态。"
  }
}
```

Declared consumers:
- user_decision

Use English JSON keys and concise values in the user's language. Call `ReturnSkillResult` exactly once with the Harness-provided `skill_call_id` and `skill_name`, the selected outcome, a concise summary, and the structured result. Do not add post-Skill guidance after the call is accepted.

## Final check before returning

- 确认 public_contact_directory 中每个条目都包含非空的 source_url。
- 确认没有包含任何私人邮箱、私人手机号或非公开社交账号。
- 确认 priority_rank 的分配逻辑与 follow_up_preferences 中的规则严格一致。
- 确认未修改或重写 draft_message 的任何内容。
