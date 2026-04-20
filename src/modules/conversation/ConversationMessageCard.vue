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

function formatFileType(file: MessageFileAttachment) {
  if (!file.mimeType || file.mimeType === 'application/octet-stream') {
    return '本地文件';
  }

  const [, subtype] = file.mimeType.split('/');
  return subtype?.toUpperCase() ?? file.mimeType;
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

    <div v-if="visibleMedia.length || visibleFiles.length" class="message-attachment-list" aria-label="附件内容">
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

      <component
        v-for="file in visibleFiles"
        :is="file.safeUrl ? 'a' : 'div'"
        :key="file.id"
        class="message-file-card"
        :class="{ disabled: !file.safeUrl }"
        :href="file.safeUrl ?? undefined"
        :download="file.safeUrl ? file.name : undefined"
      >
        <span class="file-icon" aria-hidden="true">
          FILE
        </span>
        <span class="file-copy">
          <strong>{{ file.name }}</strong>
          <small>{{ formatFileType(file) }} · {{ formatFileSize(file) }}</small>
        </span>
        <span class="file-action">{{ file.safeUrl ? '打开' : '不可打开' }}</span>
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

.message-attachment-list {
  display: grid;
  gap: 14px;
  margin-top: 16px;
}

.message-card.user .message-attachment-list {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 10px;
}

.message-file-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, var(--color-primary));
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.44), rgba(249, 229, 207, 0.16)),
    color-mix(in srgb, var(--color-surface-strong) 90%, white);
  color: inherit;
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
  box-shadow: 0 14px 32px rgba(35, 49, 59, 0.08);
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
  width: 48px;
  height: 48px;
  border-radius: 15px;
  border: 1px solid color-mix(in srgb, var(--color-secondary) 30%, var(--color-border));
  background:
    linear-gradient(155deg, color-mix(in srgb, var(--color-secondary-soft) 78%, white), var(--color-surface-strong));
  color: var(--color-secondary-strong);
  font-size: 0.68rem;
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
  font-size: 0.92rem;
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
  border: 1px solid color-mix(in srgb, var(--color-border) 86%, var(--color-primary));
  border-radius: 24px;
  background:
    linear-gradient(145deg, rgba(29, 115, 109, 0.08), rgba(255, 255, 255, 0.18)),
    color-mix(in srgb, var(--color-surface-strong) 88%, white);
  box-shadow: 0 16px 42px rgba(35, 49, 59, 0.07);
}

.message-card.user .message-media-card {
  flex: 0 1 190px;
  width: 190px;
  border-radius: 20px;
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
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-heading span {
  flex: 0 0 auto;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary-soft) 76%, white);
  color: var(--color-primary);
  font-size: 0.74rem;
  font-weight: 800;
  padding: 0.28rem 0.52rem;
}

.message-image,
.message-video {
  display: block;
  width: 100%;
  max-height: min(480px, 58vh);
  border-top: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  background:
    radial-gradient(circle at 20% 15%, rgba(217, 240, 235, 0.2), transparent 34%),
    #0e1717;
}

.message-image {
  object-fit: contain;
}

.message-card.user .message-image {
  height: 118px;
  max-height: none;
  object-fit: cover;
}

.message-video {
  aspect-ratio: 16 / 9;
}

.message-card.user .message-video {
  height: 118px;
  max-height: none;
  object-fit: cover;
}

.message-media-card figcaption {
  padding: 12px 14px 14px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  line-height: 1.6;
}

.message-card.user .message-media-card figcaption {
  display: -webkit-box;
  overflow: hidden;
  padding: 9px 10px 10px;
  font-size: 0.78rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (max-width: 640px) {
  .message-card.user .message-media-card,
  .message-card.user .message-file-card {
    flex: 1 1 100%;
    max-width: none;
    width: auto;
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
