<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type {
  AskQuestion,
  AskQuestionResponse,
  MessageBlock,
} from '../../types/entities';

type AskQuestionBlock = Pick<MessageBlock, 'id' | 'questions' | 'toolUseId' | 'status'> & {
  title?: string | null;
};

const SKIPPED_ANSWER = '已跳过';

const props = defineProps<{
  block: AskQuestionBlock;
  disabled?: boolean;
  completed?: boolean;
  collapsed?: boolean;
  answers?: Record<string, string>;
  respond: (toolUseId: string, response: AskQuestionResponse) => Promise<void>;
}>();

const selections = reactive<Record<string, string[]>>({});
const notes = reactive<Record<string, string>>({});
const skippedQuestionKeys = reactive(new Set<string>());
const submitting = ref(false);
const submitted = ref(false);
const errorMessage = ref<string | null>(null);
const expanded = ref(false);
const currentQuestionIndex = ref(0);

const questions = computed(() => props.block.questions ?? []);
const currentQuestion = computed(() => questions.value[currentQuestionIndex.value]);
const isCompact = computed(() => Boolean(props.collapsed && !expanded.value));
const hasMultipleQuestions = computed(() => questions.value.length > 1);
const isFirstQuestion = computed(() => currentQuestionIndex.value === 0);
const isLastQuestion = computed(() => currentQuestionIndex.value >= questions.value.length - 1);
const questionProgress = computed(() => `${Math.min(currentQuestionIndex.value + 1, questions.value.length)} / ${questions.value.length}`);
const responseCount = computed(() => questions.value.filter(hasQuestionResponse).length);
const skippedCount = computed(() => questions.value.filter(isQuestionSkipped).length);
const canRespond = computed(() => Boolean(
  props.block.toolUseId
  && !props.disabled
  && props.block.status === 'pending'
  && !submitted.value,
));
const isResultView = computed(() => Boolean(props.completed || submitted.value));
const stateLabel = computed(() => {
  if (submitted.value) return '答案已提交';
  if (props.completed) return '已处理';
  return canRespond.value ? '等待你的回答' : '已结束';
});
const compactSummary = computed(() => {
  const firstQuestion = questions.value[0]?.question ?? '需要你的选择';
  return questions.value.length > 1
    ? `${firstQuestion} 等 ${questions.value.length} 个问题`
    : firstQuestion;
});
const compactDetail = computed(() => {
  if (!responseCount.value) return '展开查看结果';
  const skipped = skippedCount.value ? `，跳过 ${skippedCount.value} 题` : '';
  return `已处理 ${responseCount.value} / ${questions.value.length} 题${skipped} · 展开查看`;
});
const primaryActionLabel = computed(() => {
  if (isLastQuestion.value) return submitting.value ? '正在提交…' : '提交全部答案';
  return hasQuestionResponse(currentQuestion.value) ? '下一题' : '提交';
});

function expandCard() {
  expanded.value = true;
}

function collapseCard() {
  expanded.value = false;
}

function showPreviousQuestion() {
  if (isFirstQuestion.value) return;
  currentQuestionIndex.value -= 1;
}

function showNextQuestion() {
  if (isLastQuestion.value) return;
  currentQuestionIndex.value += 1;
}

function storedAnswer(question: AskQuestion) {
  return props.answers?.[question.question]?.trim() ?? '';
}

function isQuestionSkipped(question: AskQuestion) {
  return skippedQuestionKeys.has(question.question) || storedAnswer(question) === SKIPPED_ANSWER;
}

function selectedLabels(question: AskQuestion) {
  const selected = selections[question.question];
  if (selected) return selected;

  const answer = storedAnswer(question);
  if (!answer || answer === SKIPPED_ANSWER) return [];
  if (!question.multiSelect) {
    return question.options.some((option) => option.label === answer) ? [answer] : [];
  }

  const labels = new Set(answer.split(',').map((value) => value.trim()));
  return question.options.filter((option) => labels.has(option.label)).map((option) => option.label);
}

function isSelected(question: AskQuestion, label: string) {
  return selectedLabels(question).includes(label);
}

function selectOption(question: AskQuestion, label: string) {
  if (!canRespond.value) return;
  errorMessage.value = null;
  skippedQuestionKeys.delete(question.question);
  const current = selectedLabels(question);
  if (!question.multiSelect) {
    selections[question.question] = [label];
    notes[question.question] = '';
    return;
  }

  selections[question.question] = current.includes(label)
    ? current.filter((value) => value !== label)
    : [...current, label];
}

function beginOtherAnswer(question: AskQuestion) {
  skippedQuestionKeys.delete(question.question);
  if (!question.multiSelect) {
    selections[question.question] = [];
  }
}

function answerFor(question: AskQuestion) {
  if (isQuestionSkipped(question)) return SKIPPED_ANSWER;
  const selected = selectedLabels(question);
  const note = notes[question.question]?.trim();
  const hasLocalAnswer = Object.prototype.hasOwnProperty.call(selections, question.question) || Boolean(note);
  if (!hasLocalAnswer) return storedAnswer(question);
  if (!question.multiSelect) {
    return note || selected[0] || '';
  }
  return [...selected, ...(note ? [note] : [])].join(', ');
}

function hasQuestionResponse(question: AskQuestion | undefined) {
  return Boolean(question && answerFor(question));
}

function selectedPreview(question: AskQuestion) {
  const selected = selectedLabels(question);
  if (selected.length !== 1) return undefined;
  return question.options.find((option) => option.label === selected[0])?.preview;
}

function buildResponse(): AskQuestionResponse | null {
  const firstUnansweredIndex = questions.value.findIndex((question) => !answerFor(question));
  if (firstUnansweredIndex >= 0) {
    currentQuestionIndex.value = firstUnansweredIndex;
    errorMessage.value = '请先回答全部问题，或在“其他”中填写你的想法。';
    return null;
  }

  const answers = Object.fromEntries(
    questions.value.map((question) => [question.question, answerFor(question)]),
  );

  const annotations = Object.fromEntries(
    questions.value.flatMap((question) => {
      const preview = selectedPreview(question);
      const notesValue = notes[question.question]?.trim();
      return preview || notesValue
        ? [[question.question, {
            ...(preview ? { preview } : {}),
            ...(notesValue ? { notes: notesValue } : {}),
          }]]
        : [];
    }),
  );

  return {
    approved: true,
    answers,
    ...(Object.keys(annotations).length ? { annotations } : {}),
  };
}

async function submitAnswers() {
  const toolUseId = props.block.toolUseId;
  const response = buildResponse();
  if (!toolUseId || !response || submitting.value) return;

  submitting.value = true;
  errorMessage.value = null;
  try {
    await props.respond(toolUseId, response);
    submitted.value = true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '提交答案失败，请重试。';
  } finally {
    submitting.value = false;
  }
}

function skipCurrentQuestion() {
  const question = currentQuestion.value;
  if (!question || !canRespond.value || submitting.value) return;

  skippedQuestionKeys.add(question.question);
  selections[question.question] = [];
  notes[question.question] = '';
  errorMessage.value = null;
  if (!isLastQuestion.value) {
    showNextQuestion();
  }
}

async function saveCurrentQuestionAndContinue() {
  const question = currentQuestion.value;
  if (!question || submitting.value) return;
  if (!hasQuestionResponse(question)) {
    errorMessage.value = '请选择一个答案、填写“其他”，或跳过此题。';
    return;
  }

  errorMessage.value = null;
  if (isLastQuestion.value) {
    await submitAnswers();
    return;
  }
  showNextQuestion();
}
</script>

<template>
  <section
    class="ask-question-card"
    :class="{ inactive: !canRespond && !isCompact, compact: isCompact }"
    aria-label="需要回答的问题"
  >
    <button
      v-if="isCompact"
      type="button"
      class="ask-question-compact-trigger"
      :aria-expanded="false"
      @click="expandCard"
    >
      <span class="ask-question-card-chip">{{ stateLabel }}</span>
      <span class="ask-question-compact-copy">
        <strong>{{ compactSummary }}</strong>
        <small>{{ compactDetail }}</small>
      </span>
      <span class="ask-question-compact-icon" aria-hidden="true">⌄</span>
    </button>

    <template v-else>
      <header class="ask-question-card-header">
        <span class="ask-question-card-chip">{{ block.title ?? '需要你的选择' }}</span>
        <span v-if="hasMultipleQuestions" class="ask-question-progress" aria-live="polite">
          第 {{ questionProgress }} 题
        </span>
        <span class="ask-question-card-state">{{ stateLabel }}</span>
        <button
          v-if="collapsed"
          type="button"
          class="ask-question-collapse"
          aria-label="收起已完成的问题"
          @click="collapseCard"
        >
          收起
        </button>
      </header>

      <section v-if="isResultView" class="ask-question-result" aria-label="回答结果">
        <header>
          <strong>回答结果</strong>
          <span>{{ responseCount }} / {{ questions.length }} 题已处理</span>
        </header>
        <dl>
          <div v-for="(question, questionIndex) in questions" :key="`result-${question.question}`">
            <dt><span>{{ questionIndex + 1 }}</span>{{ question.question }}</dt>
            <dd>{{ answerFor(question) || '未提供回答' }}</dd>
          </div>
        </dl>
      </section>

      <form v-else class="ask-question-form" @submit.prevent="saveCurrentQuestionAndContinue">
        <fieldset v-if="currentQuestion" :key="currentQuestion.question" class="ask-question-fieldset ask-question-stage">
          <legend>
            <span class="ask-question-number">{{ currentQuestionIndex + 1 }}</span>
            <span>{{ currentQuestion.question }}</span>
          </legend>
          <p class="ask-question-header">{{ currentQuestion.header }}{{ currentQuestion.multiSelect ? ' · 可多选' : '' }}</p>

          <div class="ask-question-options" :role="currentQuestion.multiSelect ? 'group' : 'radiogroup'">
            <button
              v-for="option in currentQuestion.options"
              :key="option.label"
              type="button"
              class="ask-question-option"
              :class="{ selected: isSelected(currentQuestion, option.label) }"
              :role="currentQuestion.multiSelect ? 'checkbox' : 'radio'"
              :aria-checked="isSelected(currentQuestion, option.label)"
              :disabled="!canRespond || submitting"
              @click="selectOption(currentQuestion, option.label)"
            >
              <span class="ask-question-control" aria-hidden="true"></span>
              <span class="ask-question-option-copy">
                <strong>{{ option.label }}</strong>
                <small>{{ option.description }}</small>
              </span>
            </button>
          </div>

          <pre v-if="selectedPreview(currentQuestion)" class="ask-question-preview">{{ selectedPreview(currentQuestion) }}</pre>

          <label class="ask-question-other">
            <span>其他</span>
            <input
              v-model="notes[currentQuestion.question]"
              type="text"
              :disabled="!canRespond || submitting"
              :placeholder="currentQuestion.multiSelect ? '可补充你的想法' : '输入你的想法…'"
              @focus="beginOtherAnswer(currentQuestion)"
            />
          </label>
        </fieldset>

        <p v-if="errorMessage" class="ask-question-error" role="alert">{{ errorMessage }}</p>
        <p v-else-if="submitted" class="ask-question-success" role="status">已发送给助手，正在继续处理…</p>

        <footer class="ask-question-actions">
          <button
            type="button"
            class="ask-question-previous"
            :disabled="!canRespond || submitting || isFirstQuestion"
            @click="showPreviousQuestion"
          >
            上一题
          </button>
          <button
            type="button"
            class="ask-question-skip"
            :disabled="!canRespond || submitting"
            @click="skipCurrentQuestion"
          >
            {{ currentQuestion && isQuestionSkipped(currentQuestion) ? '此题已跳过' : '跳过此题' }}
          </button>
          <button
            type="button"
            class="ask-question-submit"
            :disabled="!canRespond || submitting"
            @click="saveCurrentQuestionAndContinue"
          >
            {{ primaryActionLabel }}
          </button>
        </footer>
      </form>
    </template>
  </section>
</template>

<style scoped>
.ask-question-card {
  display: grid;
  gap: 14px;
  max-width: 620px;
  padding: 15px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 25%, var(--color-border));
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-surface-strong) 91%, var(--color-primary-soft));
}

.ask-question-card.inactive { opacity: 0.72; }
.ask-question-card.compact { padding: 0; }

.ask-question-card-header,
.ask-question-actions,
.ask-question-other {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ask-question-card-header { justify-content: space-between; }

.ask-question-compact-trigger {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 13px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.ask-question-compact-trigger:hover {
  background: color-mix(in srgb, var(--color-primary-soft) 48%, transparent);
}

.ask-question-compact-copy { display: grid; min-width: 0; gap: 2px; }
.ask-question-compact-copy strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.86rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ask-question-compact-copy small { color: var(--color-text-muted); font-size: 0.74rem; }
.ask-question-compact-icon { color: var(--color-text-muted); font-size: 1rem; }

.ask-question-collapse {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 700;
}

.ask-question-card-chip {
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-warning-soft) 76%, white);
  color: #a55d00;
  font-size: 0.75rem;
  font-weight: 800;
}

.ask-question-card-state {
  color: var(--color-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.ask-question-progress,
.ask-question-footer-progress {
  color: var(--color-primary);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  white-space: nowrap;
}

.ask-question-form {
  display: grid;
  gap: 12px;
}

.ask-question-fieldset {
  display: grid;
  gap: 9px;
  min-width: 0;
  padding: 0;
  border: 0;
}

.ask-question-stage {
  align-content: start;
}

.ask-question-fieldset + .ask-question-fieldset {
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 76%, transparent);
}

.ask-question-fieldset legend {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 0;
  color: var(--color-text);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.45;
}

.ask-question-number {
  display: grid;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 999px;
  background: var(--color-primary);
  color: white;
  font-size: 0.7rem;
}

.ask-question-header {
  margin: 0 0 0 28px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.ask-question-options { display: grid; gap: 8px; }

.ask-question-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  width: 100%;
  padding: 10px 11px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-strong);
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.ask-question-option:hover:not(:disabled),
.ask-question-option.selected {
  border-color: color-mix(in srgb, var(--color-primary) 64%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary-soft) 64%, white);
}

.ask-question-option:focus-visible,
.ask-question-other input:focus-visible,
.ask-question-actions button:focus-visible,
.ask-question-compact-trigger:focus-visible,
.ask-question-collapse:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary) 60%, transparent);
  outline-offset: 2px;
}

.ask-question-option:disabled,
.ask-question-actions button:disabled,
.ask-question-other input:disabled { cursor: not-allowed; }

.ask-question-control {
  width: 18px;
  height: 18px;
  margin-top: 1px;
  border: 1.5px solid var(--color-border-strong);
  border-radius: 999px;
  background: white;
}

.ask-question-option.selected .ask-question-control {
  border: 5px solid var(--color-primary);
}

.ask-question-option-copy { display: grid; gap: 3px; }
.ask-question-option-copy strong { color: var(--color-text); font-size: 0.9rem; }
.ask-question-option-copy small { color: var(--color-text-muted); font-size: 0.78rem; line-height: 1.42; }

.ask-question-preview {
  margin: 0;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-bg-subtle) 82%, white);
  color: var(--color-text-muted);
  font: 0.76rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.ask-question-result {
  display: grid;
  gap: 8px;
}

.ask-question-result header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.ask-question-result header strong { color: var(--color-text); font-size: 0.9rem; }
.ask-question-result header span { color: var(--color-text-muted); font-size: 0.76rem; }
.ask-question-result dl { display: grid; gap: 8px; margin: 0; }
.ask-question-result dl > div {
  display: grid;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--color-surface-strong) 88%, var(--color-bg-subtle));
}
.ask-question-result dt {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  line-height: 1.4;
}
.ask-question-result dt span {
  display: grid;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 0.68rem;
  font-weight: 800;
}
.ask-question-result dd {
  margin: 0 0 0 25px;
  color: var(--color-text);
  font-size: 0.86rem;
  font-weight: 750;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ask-question-other { color: var(--color-text-muted); font-size: 0.82rem; font-weight: 700; }
.ask-question-other input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 9px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  font: inherit;
}

.ask-question-error, .ask-question-success { margin: 0; font-size: 0.82rem; }
.ask-question-error { color: var(--color-error, #b3261e); }
.ask-question-success { color: var(--color-primary); }

.ask-question-actions { justify-content: flex-end; }
.ask-question-previous { margin-right: auto; }
.ask-question-actions button {
  padding: 0.56rem 0.82rem;
  border-radius: 9px;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 800;
}

.ask-question-skip {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
}

.ask-question-previous,
.ask-question-next {
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-primary-soft) 44%, white);
  color: var(--color-primary);
}

.ask-question-submit {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: white;
}

@media (max-width: 640px) {
  .ask-question-card { padding: 12px; }
  .ask-question-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ask-question-actions button { width: 100%; }
  .ask-question-result header { align-items: flex-start; flex-direction: column; gap: 2px; }
}
</style>
