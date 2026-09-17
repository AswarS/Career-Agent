<script setup lang="ts">
import { computed, ref } from 'vue';
import MarkdownContent from '../../components/MarkdownContent.vue';
import AskUserQuestionCard from './AskUserQuestionCard.vue';
import type { AskQuestionResponse, MessageAction, ThreadMessage } from '../../types/entities';
import { downloadMessageFile } from '../../services/messageFileDownloads';
import {
  createMessageViewModel,
  type MessageBlockView,
  type MessageFileAttachmentView,
  type MessageReplyUnitView,
} from './messageViewModel';

const props = defineProps<{
  message: ThreadMessage;
  multiAgentMode?: boolean;
  respondToQuestion?: (toolUseId: string, response: AskQuestionResponse) => Promise<void>;
}>();

const emit = defineEmits<{
  action: [action: MessageAction];
}>();

const viewModel = computed(() => createMessageViewModel(props.message, {
  multiAgentMode: Boolean(props.multiAgentMode),
}));
const expandedReplyUnitIds = ref(new Set<string>());
const expandedToolResultIds = ref(new Set<string>());
const answeredInteractiveToolUseIds = computed(() => new Set(
  viewModel.value.blocks
    .filter((block) => block.type === 'tool_result' && block.toolUseId)
    .map((block) => block.toolUseId),
));
const interactiveAnswersByToolUseId = computed(() => new Map(
  viewModel.value.blocks
    .filter((block) => block.type === 'tool_result' && block.toolUseId && block.answers)
    .map((block) => [block.toolUseId!, block.answers!] as const),
));
const activeQuestionBlockId = computed(() => {
  if (!props.message.streaming) {
    return null;
  }

  return [...viewModel.value.askQuestionBlocks]
    .reverse()
    .find((block) => !isQuestionAnswered(block.toolUseId))
    ?.id ?? null;
});

function handleAction(action: MessageAction) {
  emit('action', action);
}

function isActionOnlyBlock(block: MessageBlockView) {
  return block.type === 'artifact'
    && !block.text
    && !block.media.length
    && !block.files.length
    && block.actions.length > 0;
}

function getReplyUnitKey(unit: MessageReplyUnitView) {
  return `${viewModel.value.id}:${unit.id}`;
}

function isReplyUnitExpanded(unit: MessageReplyUnitView) {
  return expandedReplyUnitIds.value.has(getReplyUnitKey(unit));
}

function toggleReplyUnit(unit: MessageReplyUnitView) {
  if (!unit.hasHiddenExecutionBlocks) {
    return;
  }

  const key = getReplyUnitKey(unit);
  const nextIds = new Set(expandedReplyUnitIds.value);
  if (nextIds.has(key)) {
    nextIds.delete(key);
  } else {
    nextIds.add(key);
  }
  expandedReplyUnitIds.value = nextIds;
}

function getToolResultKey(unit: MessageReplyUnitView, block: MessageBlockView) {
  return `${getReplyUnitKey(unit)}:${block.id}`;
}

function isToolResultExpanded(unit: MessageReplyUnitView, block: MessageBlockView) {
  return expandedToolResultIds.value.has(getToolResultKey(unit, block));
}

function toggleToolResult(unit: MessageReplyUnitView, block: MessageBlockView) {
  if (!block.hasResultBlocks) {
    return;
  }

  const key = getToolResultKey(unit, block);
  const nextIds = new Set(expandedToolResultIds.value);
  if (nextIds.has(key)) {
    nextIds.delete(key);
  } else {
    nextIds.add(key);
  }
  expandedToolResultIds.value = nextIds;
}

function openFullscreen(event: MouseEvent) {
  const btn = event.currentTarget as HTMLButtonElement;
  const iframe = btn.closest('.message-app-wrapper')?.querySelector('iframe') as HTMLIFrameElement | null;
  if (!iframe) return;
  const req = iframe.requestFullscreen ?? (iframe as any).webkitRequestFullscreen;
  req?.call(iframe);
}

async function handleFileDownload(file: MessageFileAttachmentView) {
  if (!file.canDownload) {
    return;
  }

  try {
    await downloadMessageFile(file);
  } catch (error) {
    console.error(error);
  }
}

async function respondToQuestion(toolUseId: string, response: AskQuestionResponse) {
  if (!props.respondToQuestion) {
    throw new Error('当前连接不支持提交问题答案。');
  }
  await props.respondToQuestion(toolUseId, response);
}

function isQuestionAnswered(toolUseId: string | null | undefined) {
  return Boolean(toolUseId && answeredInteractiveToolUseIds.value.has(toolUseId));
}

function isQuestionCollapsed(block: MessageBlockView) {
  return activeQuestionBlockId.value !== block.id;
}

function getQuestionAnswers(toolUseId: string | null | undefined) {
  return toolUseId ? interactiveAnswersByToolUseId.value.get(toolUseId) : undefined;
}

</script>

<template>
  <article class="message-card" :class="[viewModel.role, viewModel.accentClass]">
    <div class="message-topline" :class="{ compact: !viewModel.showSpeakerIdentity }">
      <div v-if="viewModel.showSpeakerIdentity" class="speaker-group">
        <strong>{{ viewModel.speakerName }}</strong>
        <span v-if="viewModel.speakerMeta" class="speaker-meta">
          {{ viewModel.speakerMeta }}
        </span>
        <span v-if="viewModel.runtimeMetaLabel" class="speaker-meta runtime">
          {{ viewModel.runtimeMetaLabel }}
        </span>
      </div>
      <span class="message-timestamp">{{ viewModel.createdAt }}</span>
    </div>

    <div class="message-block-list">
      <p
        v-if="viewModel.streaming && !viewModel.replyUnits.length"
        class="status-copy streaming-placeholder"
      >
        正在处理…
      </p>

      <section
        v-for="(unit, unitIndex) in viewModel.replyUnits"
        :key="unit.id"
        class="message-reply-unit"
        :data-message-reply-unit="unitIndex"
        :class="{ pending: unit.pending, 'has-text': Boolean(unit.textBlock) }"
      >
        <div v-if="unit.hasHiddenExecutionBlocks" class="execution-fold">
          <button
            type="button"
            class="execution-toggle"
            :class="{ expanded: isReplyUnitExpanded(unit) }"
            :aria-expanded="isReplyUnitExpanded(unit)"
            :aria-label="isReplyUnitExpanded(unit)
              ? '收起此回复的思考过程和工具调用'
              : `展开此回复的思考过程和工具调用，共 ${unit.hiddenExecutionBlockCount} 项`"
            :title="isReplyUnitExpanded(unit) ? '收起过程' : '展开过程'"
            @click="toggleReplyUnit(unit)"
          >
            <span class="execution-chevron" aria-hidden="true">⌄</span>
          </button>

          <div v-if="isReplyUnitExpanded(unit)" class="execution-block-list">
            <section
              v-for="block in unit.executionBlocks"
              :key="`execution-${unit.id}-${block.id}`"
              class="message-timeline-block"
              :class="[block.type, { error: block.isError }]"
            >
              <div
                v-if="block.type === 'tool_call'"
                class="tool-call-header"
              >
                <button
                  v-if="block.hasResultBlocks"
                  type="button"
                  class="tool-result-toggle"
                  :aria-expanded="isToolResultExpanded(unit, block)"
                  @click="toggleToolResult(unit, block)"
                >
                  {{ isToolResultExpanded(unit, block) ? 'Hide result' : 'Show result' }}
                </button>
                <span class="tool-call-title">{{ block.title }}</span>
                <small v-if="block.status">{{ block.status }}</small>
              </div>
              <div v-else class="timeline-block-label">
                <span>{{ block.title }}</span>
                <small v-if="block.status">{{ block.status }}</small>
              </div>

              <MarkdownContent v-if="block.text" :source="block.text" />

              <div
                v-if="block.type === 'tool_call' && block.hasResultBlocks && isToolResultExpanded(unit, block)"
                class="tool-result-nested"
              >
                <section
                  v-for="resultBlock in block.resultBlocks ?? []"
                  :key="`result-${unit.id}-${resultBlock.id}`"
                  class="message-timeline-block tool_result"
                  :class="{ error: resultBlock.isError }"
                >
                  <div class="timeline-block-label">
                    <span>{{ resultBlock.title }}</span>
                    <small v-if="resultBlock.status">{{ resultBlock.status }}</small>
                  </div>
                  <MarkdownContent v-if="resultBlock.text" :source="resultBlock.text" />
                </section>
              </div>
            </section>

            <details
              v-if="unit.standaloneToolResultBlocks.length"
              class="standalone-tool-results"
            >
              <summary>Unmatched tool results ({{ unit.standaloneToolResultBlocks.length }})</summary>
              <section
                v-for="block in unit.standaloneToolResultBlocks"
                :key="`standalone-result-${unit.id}-${block.id}`"
                class="message-timeline-block tool_result"
                :class="{ error: block.isError }"
              >
                <div class="timeline-block-label">
                  <span>{{ block.title }}</span>
                  <small v-if="block.status">{{ block.status }}</small>
                </div>
                <MarkdownContent v-if="block.text" :source="block.text" />
              </section>
            </details>
          </div>
        </div>

        <MarkdownContent
          v-if="unit.textBlock && viewModel.kind === 'markdown'"
          :source="unit.textBlock.text"
        />
        <p v-else-if="unit.textBlock" class="status-copy">{{ unit.textBlock.text }}</p>
        <p v-else-if="unit.pending" class="status-copy streaming-placeholder">正在处理…</p>

      <template v-for="block in unit.artifactBlocks" :key="block.id">
        <section
          class="message-timeline-block"
          :class="[
            block.type,
            {
              error: block.isError,
              'action-only': isActionOnlyBlock(block),
            },
          ]"
        >
          <div v-if="block.title || block.status" class="timeline-block-label">
            <span>{{ block.title }}</span>
            <small v-if="block.status">{{ block.status }}</small>
          </div>
          <MarkdownContent v-if="block.text" :source="block.text" />

          <div v-if="block.media.length || block.files.length" class="message-attachment-list" aria-label="附件内容">
            <figure
              v-for="media in block.media"
              :key="media.id"
              class="message-media-card"
              :class="media.kind"
            >
              <img
                v-if="media.kind === 'image'"
                class="message-image"
                :src="media.url"
                :alt="media.altText"
                loading="lazy"
              />

              <video
                v-else-if="media.kind === 'video'"
                class="message-video"
                :src="media.url"
                :poster="media.posterUrl"
                :aria-label="media.altText"
                controls
                playsinline
                preload="metadata"
              >
                当前浏览器不支持视频播放。
              </video>

              <audio
                v-else-if="media.kind === 'audio'"
                class="message-audio"
                :src="media.url"
                :aria-label="media.altText"
                controls
                preload="metadata"
              >
                当前浏览器不支持音频播放。
              </audio>

              <template v-else-if="media.kind === 'html'">
                <iframe
                  class="message-iframe"
                  :src="media.url"
                  :title="media.altText"
                  sandbox="allow-scripts"
                  loading="lazy"
                />
              </template>

              <template v-else-if="media.kind === 'app'">
                <div class="message-app-wrapper">
                  <iframe
                    class="message-iframe"
                    :src="media.url"
                    :title="media.altText"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    class="app-fullscreen-btn"
                    :aria-label="`全屏显示 ${media.title ?? '应用'}`"
                    @click="openFullscreen($event)"
                  >全屏</button>
                </div>
              </template>

              <template v-else-if="media.kind === 'file'">
                <a
                  class="message-file-media"
                  :href="media.url"
                  :download="media.title ?? true"
                  :aria-label="`下载 ${media.title ?? '文件'}`"
                >
                  <span class="file-icon" aria-hidden="true">FILE</span>
                  <span class="file-copy">
                    <strong>{{ media.title ?? '生成文件' }}</strong>
                    <small>点击下载</small>
                  </span>
                </a>
              </template>
            </figure>

            <button
              v-for="file in block.files"
              type="button"
              :key="file.id"
              class="message-file-card"
              :class="{ disabled: !file.canDownload }"
              :disabled="!file.canDownload"
              @click="handleFileDownload(file)"
            >
              <span class="file-icon" aria-hidden="true">
                FILE
              </span>
              <span class="file-copy">
                <strong>{{ file.name }}</strong>
                <small>{{ file.displayType }} · {{ file.displaySize }}</small>
              </span>
              <span class="file-action">{{ file.canDownload ? '下载' : '不可下载' }}</span>
            </button>
          </div>

          <div v-if="block.actions.length" class="message-actions">
            <button
              v-for="action in block.actions"
              :key="action.id"
              type="button"
              class="message-action"
              :class="{ 'praxis-launch-action': action.kind === 'launch-praxis' }"
              @click="handleAction(action)"
            >
              <template v-if="action.kind === 'launch-praxis'">
                <span class="praxis-action-mark" aria-hidden="true">P</span>
                <span class="praxis-action-copy">
                  <strong>{{ action.label }}</strong>
                  <small>进入实训平台继续学习</small>
                </span>
                <span class="praxis-action-arrow" aria-hidden="true">→</span>
              </template>
              <template v-else>{{ action.label }}</template>
            </button>
          </div>
        </section>
      </template>

      <AskUserQuestionCard
        v-for="block in unit.askQuestionBlocks"
        :key="block.id"
        :data-ask-question-tool-use-id="block.toolUseId ?? undefined"
        :block="block"
        :answers="getQuestionAnswers(block.toolUseId)"
        :collapsed="isQuestionCollapsed(block)"
        :completed="isQuestionAnswered(block.toolUseId)"
        :disabled="!message.streaming || isQuestionAnswered(block.toolUseId)"
        :respond="respondToQuestion"
      />
      </section>
    </div>

    <p
      v-if="!viewModel.textBlocks.length && !viewModel.artifactBlocks.length && !viewModel.askQuestionBlocks.length && !viewModel.hasHiddenExecutionBlocks"
      class="status-copy"
    >
      {{ viewModel.content }}
    </p>
  </article>
</template>

<style scoped>
.message-card {
  width: fit-content;
  max-width: min(100%, 760px);
  padding: 11px 13px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-strong);
  box-shadow: none;
  color: var(--color-text);
  font-size: 0.98rem;
}

.message-card.assistant {
  justify-self: start;
  border-left: 3px solid var(--color-primary);
  border-top-left-radius: 5px;
  border-bottom-left-radius: 5px;
  background: var(--color-surface-strong);
}

.message-card.assistant.agent-amber {
  border-left-color: var(--color-warning);
  background: color-mix(in srgb, var(--color-surface-strong) 88%, var(--color-warning-soft));
}

.message-card.assistant.agent-blue {
  border-left-color: #5e6f85;
  background: color-mix(in srgb, var(--color-surface-strong) 88%, #edf0f3);
}

.message-card.assistant.agent-slate {
  border-left-color: #6c7076;
  background: color-mix(in srgb, var(--color-surface-strong) 88%, var(--color-bg-subtle));
}

.message-card.user {
  justify-self: end;
  max-width: min(640px, 72%);
  border-color: color-mix(in srgb, var(--color-border-strong) 64%, transparent);
  border-bottom-right-radius: 5px;
  background: #e9e9e5;
  color: var(--color-text);
}

.message-card.system {
  border-style: dashed;
  background: color-mix(in srgb, var(--color-bg-subtle) 80%, white);
}

.message-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 7px;
}

.message-topline.compact {
  justify-content: flex-end;
  margin-bottom: 4px;
}

.message-topline strong {
  color: var(--color-text);
  text-transform: capitalize;
  font-size: 0.86rem;
}

.speaker-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.speaker-meta {
  display: inline-flex;
  align-items: center;
  padding: 0.24rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-bg-subtle) 84%, white);
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.message-timestamp {
  color: var(--color-text-muted);
  font-size: 0.72rem;
  white-space: nowrap;
}

.message-block-list {
  display: grid;
  gap: 10px;
}

.message-reply-unit {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.message-card.assistant .message-reply-unit {
  padding: 10px 11px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-surface-strong) 94%, var(--color-bg-subtle));
}

.message-card.assistant .message-reply-unit.pending {
  border-style: dashed;
}

.execution-fold {
  display: grid;
  gap: 8px;
}

.execution-toggle {
  appearance: none;
  justify-self: start;
  display: inline-grid;
  width: 28px;
  height: 22px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 1rem;
  line-height: 1;
}

.execution-toggle:hover {
  background: color-mix(in srgb, var(--color-bg-subtle) 82%, transparent);
  color: var(--color-text);
}

.execution-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary) 55%, transparent);
  outline-offset: 2px;
}

.execution-chevron {
  display: block;
  transform: translateY(-2px);
  transition: transform 160ms ease;
}

.execution-toggle.expanded .execution-chevron {
  transform: translateY(2px) rotate(180deg);
}

.execution-block-list {
  display: grid;
  gap: 8px;
  padding-left: 10px;
  border-left: 1px dashed color-mix(in srgb, var(--color-border) 88%, transparent);
}

.tool-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.tool-result-toggle {
  appearance: none;
  flex: 0 0 auto;
  padding: 0.18rem 0.46rem;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-surface-strong) 76%, #fff7e6);
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 900;
}

.tool-result-toggle:hover {
  border-color: color-mix(in srgb, #b77808 36%, var(--color-border));
  color: var(--color-text);
}

.tool-call-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-call-header small {
  margin-left: auto;
  font-weight: 700;
  white-space: nowrap;
}

.tool-result-nested {
  display: grid;
  gap: 7px;
  margin: 0 8px 8px 14px;
}

.standalone-tool-results {
  display: grid;
  gap: 7px;
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

.standalone-tool-results summary {
  cursor: pointer;
  font-weight: 800;
}

.message-timeline-block {
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-left-width: 3px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-surface-strong) 92%, white);
  overflow: hidden;
}

.message-timeline-block.status,
.message-timeline-block.skill {
  border-left-color: color-mix(in srgb, #687083 70%, var(--color-border));
  background: color-mix(in srgb, var(--color-bg-subtle) 70%, var(--color-surface-strong));
}

.message-timeline-block.tool_call {
  border-left-color: color-mix(in srgb, #b77808 72%, var(--color-border));
  background: color-mix(in srgb, #fff7e6 52%, var(--color-surface-strong));
}

.message-timeline-block.tool_result {
  border-left-color: color-mix(in srgb, #16846f 72%, var(--color-border));
  background: color-mix(in srgb, #edf9f5 56%, var(--color-surface-strong));
}

.message-timeline-block.artifact {
  border-left-color: color-mix(in srgb, var(--color-primary) 72%, var(--color-border));
}

.message-timeline-block.artifact.action-only {
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}

.message-timeline-block.error {
  border-left-color: color-mix(in srgb, var(--color-error, #b3261e) 72%, var(--color-border));
  background: color-mix(in srgb, #fff1f0 54%, var(--color-surface-strong));
}

.timeline-block-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 800;
}

.timeline-block-label small {
  font-weight: 700;
}

.message-timeline-block :deep(.markdown-body) {
  padding: 5px 10px 9px;
}

.message-timeline-block.tool_result :deep(.markdown-body) {
  max-height: 260px;
  overflow: auto;
}

.status-copy {
  margin: 0;
  line-height: 1.55;
}

.streaming-placeholder {
  color: var(--color-text-muted);
}

.message-attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.message-file-card {
  appearance: none;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, var(--color-primary));
  border-radius: 14px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.44), rgba(249, 229, 207, 0.16)),
    color-mix(in srgb, var(--color-surface-strong) 90%, white);
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  text-decoration: none;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.message-card.user .message-file-card {
  flex: 1 1 220px;
  max-width: 340px;
  min-height: 84px;
}

.message-file-card:hover {
  border-color: color-mix(in srgb, var(--color-primary) 42%, var(--color-border));
  box-shadow: 0 8px 20px rgba(32, 36, 42, 0.08);
  transform: translateY(-1px);
}

.message-file-card.disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.message-file-card.disabled:hover {
  border-color: color-mix(in srgb, var(--color-border) 86%, var(--color-primary));
  box-shadow: none;
  transform: none;
}

.file-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-secondary) 30%, var(--color-border));
  background:
    linear-gradient(155deg, color-mix(in srgb, var(--color-secondary-soft) 78%, white), var(--color-surface-strong));
  color: var(--color-secondary-strong);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.file-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.file-copy strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.84rem;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-copy small {
  color: var(--color-text-muted);
}

.file-action {
  border-radius: 999px;
  padding: 0.32rem 0.66rem;
  background: color-mix(in srgb, var(--color-primary-soft) 64%, white);
  color: var(--color-primary);
  font-size: 0.76rem;
  font-weight: 900;
  white-space: nowrap;
}

.message-file-card.disabled .file-action {
  background: color-mix(in srgb, var(--color-bg-subtle) 84%, white);
  color: var(--color-text-muted);
}

.message-media-card {
  margin: 0;
  overflow: hidden;
  width: 320px;
  height: 200px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, transparent);
  border-radius: 12px;
  background: #101417;
  box-shadow: none;
}

.message-media-card.html,
.message-media-card.app {
  width: 480px;
  height: 320px;
  background: white;
}

.message-image,
.message-video,
.message-audio {
  display: block;
  width: 100%;
  height: 100%;
  background: #101417;
}

.message-image {
  object-fit: contain;
}

.message-video {
  object-fit: cover;
}

.message-audio {
  min-height: 54px;
}

.message-iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}

.message-app-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.message-app-wrapper .message-iframe {
  height: 100%;
}

.app-fullscreen-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  appearance: none;
  padding: 4px 10px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  color: #333;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: background 120ms ease;
}

.app-fullscreen-btn:hover {
  background: rgba(255, 255, 255, 1);
}

.message-file-media {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, var(--color-primary));
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-surface-strong) 90%, white);
  color: inherit;
  text-decoration: none;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.message-file-media:hover {
  border-color: color-mix(in srgb, var(--color-primary) 42%, var(--color-border));
  box-shadow: 0 4px 12px rgba(32, 36, 42, 0.08);
}

@media (max-width: 640px) {
  .message-card.user .message-media-card,
  .message-card.user .message-file-card {
    flex: 1 1 100%;
    max-width: none;
    width: auto;
  }

  .message-media-card {
    width: min(100%, 320px);
  }

  .message-file-card {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .file-action {
    grid-column: 2;
    justify-self: start;
  }
}

.message-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.message-timeline-block.action-only .message-actions {
  margin-top: 10px;
}

.message-action {
  appearance: none;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.56rem 0.78rem;
  background: var(--color-surface-strong);
  color: var(--color-text);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
}

.praxis-launch-action {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  min-width: min(100%, 286px);
  padding: 10px 12px 10px 10px;
  border-color: color-mix(in srgb, var(--color-primary) 38%, var(--color-border));
  border-radius: 14px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary-soft) 74%, white), var(--color-surface-strong));
  color: var(--color-text);
  text-align: left;
  box-shadow: 0 5px 16px rgba(32, 91, 79, 0.08);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.praxis-action-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: 0.84rem;
  font-weight: 900;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
}

.praxis-action-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.praxis-action-copy strong {
  color: var(--color-text);
  font-size: 0.88rem;
  line-height: 1.25;
}

.praxis-action-copy small {
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.25;
}

.praxis-action-arrow {
  color: var(--color-primary);
  font-size: 1.08rem;
  font-weight: 900;
  transition: transform 160ms ease;
}

@media (max-width: 760px) {
  .message-card {
    width: auto;
    max-width: 92%;
  }

  .message-card.user {
    max-width: 84%;
  }
}

.message-action:hover {
  border-color: color-mix(in srgb, var(--color-primary) 38%, var(--color-border));
  color: var(--color-primary);
}

.praxis-launch-action:hover {
  border-color: color-mix(in srgb, var(--color-primary) 64%, var(--color-border));
  color: var(--color-text);
  box-shadow: 0 9px 22px rgba(32, 91, 79, 0.14);
  transform: translateY(-1px);
}

.praxis-launch-action:hover .praxis-action-arrow {
  transform: translateX(2px);
}

.praxis-launch-action:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--color-primary) 24%, transparent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .praxis-launch-action,
  .praxis-action-arrow {
    transition: none;
  }
}
</style>
