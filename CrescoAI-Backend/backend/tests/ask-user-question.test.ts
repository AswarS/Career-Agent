import { describe, expect, test } from 'bun:test'
import {
  ASK_USER_QUESTION_RESPONSE_METADATA_MARKER,
  extractAskUserQuestionResult,
  extractAskUserQuestions,
  stripAskUserQuestionResultMetadata,
} from '../src/Network/modules/agent/ask-user-question.js'
import { AskUserQuestionTool } from '../src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx'
import { isDeferredTool } from '../src/tools/ToolSearchTool/prompt.js'
import { INTERACTIVE_TOOL_RESPONSE_TIMEOUT_MS } from '../src/server/queryEngineFactory.js'

describe('AskUserQuestion public payload', () => {
  test('loads its schema without a ToolSearch round trip', () => {
    expect(AskUserQuestionTool.alwaysLoad).toBe(true)
    expect(isDeferredTool(AskUserQuestionTool)).toBe(false)
  })

  test('allows enough time for a browser user to answer', () => {
    expect(INTERACTIVE_TOOL_RESPONSE_TIMEOUT_MS).toBe(10 * 60_000)
  })

  test('exposes only a valid, renderable question payload', () => {
    expect(extractAskUserQuestions({
      name: 'AskUserQuestion',
      input: {
        questions: [{
          header: '职业方向',
          question: '你更希望探索哪个方向？',
          options: [
            { label: '产品', description: '以用户需求和业务结果为中心' },
            { label: '工程', description: '以技术深度和交付为中心', preview: '工程路径预览' },
          ],
          multiSelect: false,
        }],
        metadata: { source: 'private-data-must-not-leak' },
      },
    })).toEqual([{
      header: '职业方向',
      question: '你更希望探索哪个方向？',
      options: [
        { label: '产品', description: '以用户需求和业务结果为中心' },
        { label: '工程', description: '以技术深度和交付为中心', preview: '工程路径预览' },
      ],
      multiSelect: false,
    }])
  })

  test('accepts the askquestion alias and rejects incomplete questions', () => {
    expect(extractAskUserQuestions({
      name: 'askquestion',
      input: {
        questions: [{
          header: '验证方式',
          question: '选择验证方式？',
          options: [
            { label: '单元测试', description: '覆盖核心逻辑' },
            { label: '端到端测试', description: '覆盖完整流程' },
          ],
          multiSelect: true,
        }],
      },
    })?.[0]?.multiSelect).toBe(true)

    expect(extractAskUserQuestions({
      name: 'AskUserQuestion',
      input: {
        questions: [{
          header: '缺少选项',
          question: '这条不能显示？',
          options: [{ label: '只有一个', description: '不符合工具约束' }],
        }],
      },
    })).toBeNull()
  })

  test('keeps completed answers available without exposing transport metadata', () => {
    const content = `User has answered your questions.${ASK_USER_QUESTION_RESPONSE_METADATA_MARKER}${JSON.stringify({
      answers: {
        '你希望怎样的工作制度？': '双休',
        '还有其他顾虑吗？': '已跳过',
      },
    })}`

    expect(extractAskUserQuestionResult({ content })).toEqual({
      answers: {
        '你希望怎样的工作制度？': '双休',
        '还有其他顾虑吗？': '已跳过',
      },
    })
    expect(stripAskUserQuestionResultMetadata(content)).toBe('User has answered your questions.')
  })

  test('reads the prior text-only result format for existing conversations', () => {
    expect(extractAskUserQuestionResult({
      content: 'User has answered your questions: "工作制度"="双休", "资金安全"="已跳过". You can now continue with the user\'s answers in mind.',
    })).toEqual({
      answers: {
        工作制度: '双休',
        资金安全: '已跳过',
      },
    })
  })
})
