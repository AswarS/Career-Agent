import type { AgentAskQuestion, AgentAskQuestionOption } from './agent.runtime.js';

const ASK_USER_QUESTION_TOOL_NAMES = new Set([
  'askuserquestion',
  'askquestion',
  'ask_user_question',
]);
export const ASK_USER_QUESTION_RESPONSE_METADATA_MARKER = '\n[CrescoAI AskUserQuestion response]\n';

export interface AskUserQuestionResult {
  answers: Record<string, string>;
}

function normalizeAnswers(value: unknown): Record<string, string> | null {
  const rawAnswers = readRecord(value);
  if (!rawAnswers) return null;

  const answers = Object.entries(rawAnswers)
    .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    .slice(0, 4)
    .map(([question, answer]) => [question.trim(), answer.trim()] as const)
    .filter(([question, answer]) => Boolean(question && answer));
  return answers.length ? Object.fromEntries(answers) : null;
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readOption(value: unknown): AgentAskQuestionOption | null {
  const option = readRecord(value);
  const label = readText(option?.label);
  const description = readText(option?.description);
  if (!label || !description) return null;

  const preview = readText(option?.preview);
  return preview ? { label, description, preview } : { label, description };
}

function readQuestion(value: unknown): AgentAskQuestion | null {
  const question = readRecord(value);
  const questionText = readText(question?.question);
  const header = readText(question?.header);
  const options = Array.isArray(question?.options)
    ? question.options.map(readOption).filter((option): option is AgentAskQuestionOption => Boolean(option))
    : [];

  if (!questionText || !header || options.length < 2 || options.length > 4) {
    return null;
  }

  return {
    question: questionText,
    header,
    options,
    multiSelect: question?.multiSelect === true || question?.multi_select === true,
  };
}

/**
 * Returns a narrowly validated public representation of an AskUserQuestion
 * tool-use block. The model's arbitrary tool input is never sent to the web
 * client; only fields that the question UI needs are exposed.
 */
export function extractAskUserQuestions(block: Record<string, unknown>): AgentAskQuestion[] | null {
  const toolName = readText(block.name ?? block.tool_name ?? block.toolName)?.toLowerCase();
  if (!toolName || !ASK_USER_QUESTION_TOOL_NAMES.has(toolName)) {
    return null;
  }

  const input = readRecord(block.input);
  if (!Array.isArray(input?.questions)) {
    return null;
  }

  const questions = input.questions
    .map(readQuestion)
    .filter((question): question is AgentAskQuestion => Boolean(question));

  return questions.length === input.questions.length && questions.length >= 1 && questions.length <= 4
    ? questions
    : null;
}

/**
 * Read the response metadata appended to an AskUserQuestion tool result.
 * The surrounding result remains model-readable text; this marker gives the
 * conversation UI a durable, structured answer record after a page reload.
 */
export function extractAskUserQuestionResult(block: Record<string, unknown>): AskUserQuestionResult | null {
  const content = readText(block.content ?? block.result ?? block.output);
  if (!content) return null;

  const markerIndex = content.lastIndexOf(ASK_USER_QUESTION_RESPONSE_METADATA_MARKER);
  if (markerIndex >= 0) {
    try {
      const metadata = JSON.parse(content.slice(markerIndex + ASK_USER_QUESTION_RESPONSE_METADATA_MARKER.length));
      const answers = normalizeAnswers(readRecord(metadata)?.answers);
      return answers ? { answers } : null;
    } catch {
      return null;
    }
  }

  // Compatibility for transcripts saved before structured metadata was added.
  // These results only contain fixed choice labels, so quoted free-form text is
  // deliberately not reconstructed beyond the safe pair syntax.
  const legacyMatch = content.match(/^User has answered your questions:\s*(.*?)\.\s*You can now continue/m);
  if (!legacyMatch?.[1]) return null;
  const answers: Record<string, string> = {};
  const pairPattern = /"([^"\r\n]+)"="([^"\r\n]*)"/g;
  for (const pair of legacyMatch[1].matchAll(pairPattern)) {
    const question = pair[1]?.trim();
    const answer = pair[2]?.trim();
    if (question && answer && Object.keys(answers).length < 4) {
      answers[question] = answer;
    }
  }
  return Object.keys(answers).length ? { answers } : null;
}

export function stripAskUserQuestionResultMetadata(value: string): string {
  const markerIndex = value.lastIndexOf(ASK_USER_QUESTION_RESPONSE_METADATA_MARKER);
  return markerIndex < 0 ? value : value.slice(0, markerIndex).trim();
}
