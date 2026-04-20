<script setup lang="ts">
import { computed } from 'vue';
import MarkdownContent from '../../components/MarkdownContent.vue';
import type { MessageAction, MessageFileAttachment, MessageMedia, ThreadMessage } from '../../types/entities';
import { getPresentedMessageContent } from './messagePresentation';

const props = defineProps<{
  message: ThreadMessage;
  multiAgentMode?: boolean;
}>();

const emit = defineEmits<{
  action: [action: MessageAction];
}>();

const presentedMessage = computed(() => getPresentedMessageContent(props.message));
const visibleActions = computed(() => props.message.role === 'assistant' ? props.message.actions ?? [] : []);
const visibleMedia = computed(() => props.message.media ?? []);
const visibleFiles = computed(() => (props.message.files ?? []).map((file) => ({
  ...file,
  safeUrl: normalizeFileUrl(file.url),
})));

function normalizeFileUrl(value: string) {
  const nextValue = value.trim();

  if (!nextValue || nextValue.startsWith('//')) {
    return null;
  }

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(nextValue)) {
    return nextValue;
  }

  try {
    const protocol = new URL(nextValue).protocol.toLowerCase();
    if (protocol === 'blob:' || protocol === 'http:' || protocol === 'https:') {
      return nextValue;
    }
  } catch {
    return null;
  }

  return null;
}

function formatRoleLabel(role: ThreadMessage['role']) {
  switch (role) {
    case 'user':
      return '用户';
    case 'assistant':
      return '助手';
    case 'system':
      return '系统';
    default:
      return role;
  }
}

function formatSpeakerName(message: ThreadMessage, multiAgentMode: boolean) {
  if (!multiAgentMode) {
    return formatRoleLabel(message.role);
  }

  return message.agentName ?? formatRoleLabel(message.role);
}

function formatSpeakerMeta(message: ThreadMessage, multiAgentMode: boolean) {
  if (!multiAgentMode || !message.agentName) {
    return null;
  }

  return formatRoleLabel(message.role);
}

function formatAgentAccentClass(message: ThreadMessage, multiAgentMode: boolean) {
  if (!multiAgentMode || !message.agentAccent) {
    return null;
  }

  return `agent-${message.agentAccent}`;
}

function handleAction(action: MessageAction) {
  emit('action', action);
}

function formatMediaTitle(media: MessageMedia) {
  if (media.title) {
    return media.title;
  }

  return media.kind === 'image' ? '图片附件' : '视频附件';
}

function formatMediaAlt(media: MessageMedia) {
  return media.alt ?? media.title ?? (media.kind === 'image' ? '对话图片' : '对话视频');
}

function formatFileSize(file: MessageFileAttachment) {
  const sizeBytes = file.sizeBytes;

  if (sizeBytes === undefined) {
    return file.mimeType ?? '文件';
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
  <article class="message-card" :class="[props.message.role, formatAgentAccentClass(props.message, Boolean(props.multiAgentMode))]">
    <div class="message-topline">
      <div class="speaker-group">
        <strong>{{ formatSpeakerName(props.message, Boolean(props.multiAgentMode)) }}</strong>
        <span v-if="formatSpeakerMeta(props.message, Boolean(props.multiAgentMode))" class="speaker-meta">
          {{ formatSpeakerMeta(props.message, Boolean(props.multiAgentMode)) }}
        </span>
      </div>
      <span>{{ props.message.createdAt }}</span>
    </div>

    <details v-if="presentedMessage.reasoning" class="reasoning-block">
      <summary>查看思考过程</summary>
      <MarkdownContent :source="presentedMessage.reasoning" />
    </details>

    <MarkdownContent v-if="props.message.kind === 'markdown'" :source="presentedMessage.content" />
    <p v-else class="status-copy">{{ presentedMessage.content }}</p>

    <div v-if="visibleMedia.length" class="message-media-list" aria-label="多模态内容">
      <figure
        v-for="media in visibleMedia"
        :key="media.id"
        class="message-media-card"
        :class="media.kind"
      >
        <div class="media-heading">
          <strong>{{ formatMediaTitle(media) }}</strong>
          <span>{{ media.kind === 'image' ? '图片' : '视频' }}</span>
        </div>

        <img
          v-if="media.kind === 'image'"
          class="message-image"
          :src="media.url"
          :alt="formatMediaAlt(media)"
          loading="lazy"
        />

        <video
          v-else
          class="message-video"
          :src="media.url"
          :poster="media.posterUrl"
          :aria-label="formatMediaAlt(media)"
          controls
          playsinline
          preload="metadata"
        >
          当前浏览器不支持视频播放。
        </video>

        <figcaption v-if="media.caption">
          {{ media.caption }}
        </figcaption>
      </figure>
    </div>

    <div v-if="visibleFiles.length" class="message-file-list" aria-label="文件附件">
      <component
        v-for="file in visibleFiles"
        :is="file.safeUrl ? 'a' : 'div'"
        :key="file.id"
        class="message-file-card"
        :class="{ disabled: !file.safeUrl }"
        :href="file.safeUrl ?? undefined"
        :download="file.safeUrl ? file.name : undefined"
      >
        <span class="file-icon">文件</span>
        <span class="file-copy">
          <strong>{{ file.name }}</strong>
          <small>{{ formatFileSize(file) }}</small>
        </span>
      </component>
    </div>

    <div v-if="visibleActions.length" class="message-actions">
      <button
        v-for="action in visibleActions"
        :key="action.id"
        type="button"
        class="message-action"
        @click="handleAction(action)"
      >
        {{ action.label }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.message-card {
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  color: var(--color-text-muted);
}

.message-card.assistant {
  background: color-mix(in srgb, var(--color-primary-soft) 46%, white);
}

.message-card.assistant.agent-amber {
  background: color-mix(in srgb, var(--color-warning-soft) 52%, white);
}

.message-card.assistant.agent-blue {
  background: color-mix(in srgb, rgba(71, 110, 163, 0.16) 72%, white);
}

.message-card.assistant.agent-slate {
  background: color-mix(in srgb, rgba(97, 112, 124, 0.12) 76%, white);
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
  margin-bottom: 10px;
}

.message-topline strong {
  color: var(--color-text);
  text-transform: capitalize;
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
  font-size: 0.74rem;
  font-weight: 700;
}

.message-topline span {
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

.reasoning-block {
  margin-bottom: 12px;
  border: 1px dashed var(--color-border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface-strong) 88%, white);
}

.reasoning-block summary {
  cursor: pointer;
  list-style: none;
  padding: 12px 14px;
  color: var(--color-text);
  font-size: 0.84rem;
  font-weight: 700;
}

.reasoning-block summary::-webkit-details-marker {
  display: none;
}

.reasoning-block :deep(.markdown-body) {
  padding: 0 14px 14px;
}

.status-copy {
  margin: 0;
  line-height: 1.7;
}

.message-media-list {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}

.message-file-list {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.message-file-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, var(--color-primary));
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface-strong) 90%, white);
  color: inherit;
  text-decoration: none;
}

.message-file-card:hover {
  border-color: color-mix(in srgb, var(--color-primary) 42%, var(--color-border));
}

.message-file-card.disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.message-file-card.disabled:hover {
  border-color: color-mix(in srgb, var(--color-border) 86%, var(--color-primary));
}

.file-icon {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 0.28rem 0.56rem;
  background: color-mix(in srgb, var(--color-primary-soft) 72%, white);
  color: var(--color-text);
  font-size: 0.74rem;
  font-weight: 800;
}

.file-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.file-copy strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-copy small {
  color: var(--color-text-muted);
}

.message-media-card {
  margin: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, var(--color-primary));
  border-radius: 22px;
  background: color-mix(in srgb, var(--color-surface-strong) 88%, white);
}

.media-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}

.media-heading strong {
  min-width: 0;
  color: var(--color-text);
  font-size: 0.9rem;
}

.media-heading span {
  flex: 0 0 auto;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary-soft) 72%, white);
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 800;
  padding: 0.28rem 0.52rem;
}

.message-image,
.message-video {
  display: block;
  width: 100%;
  max-height: min(520px, 64vh);
  background: #0e1717;
}

.message-image {
  object-fit: contain;
}

.message-video {
  aspect-ratio: 16 / 9;
}

.message-media-card figcaption {
  padding: 12px 14px 14px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  line-height: 1.6;
}

.message-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.message-action {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.72rem 0.95rem;
  background: var(--color-surface-strong);
  color: var(--color-text);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.message-action:hover {
  border-color: color-mix(in srgb, var(--color-primary) 38%, var(--color-border));
  color: var(--color-primary);
}
</style>
