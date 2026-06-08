<script setup lang="ts">
import { computed } from 'vue';
import MarkdownContent from '../../components/MarkdownContent.vue';
import type { MessageAction, MessageFileAttachment, MessageMedia, ThreadMessage } from '../../types/entities';
import { formatMessageFileSize, formatMessageFileType } from './attachmentPresentation';
import { getPresentedMessageContent } from './messagePresentation';
import { downloadMessageFile } from '../../services/messageFileDownloads';

const props = defineProps<{
  message: ThreadMessage;
  multiAgentMode?: boolean;
}>();

const emit = defineEmits<{
  action: [action: MessageAction];
}>();

const presentedMessage = computed(() => getPresentedMessageContent(props.message));
const visibleReasoning = computed(() => presentedMessage.value.reasoning);
const visibleActions = computed(() => props.message.role === 'assistant' ? props.message.actions ?? [] : []);
const visibleMedia = computed(() => props.message.media ?? []);
const visibleFiles = computed(() => (props.message.files ?? []).map((file) => ({
  ...file,
  canDownload: canDownloadFile(file.url),
})));
const showSpeakerIdentity = computed(() => props.message.role !== 'user');

function canDownloadFile(value: string) {
  const nextValue = value.trim();

  if (!nextValue || nextValue.startsWith('//')) {
    return false;
  }

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(nextValue)) {
    return true;
  }

  try {
    const protocol = new URL(nextValue).protocol.toLowerCase();
    if (protocol === 'blob:' || protocol === 'http:' || protocol === 'https:') {
      return true;
    }
  } catch {
    return false;
  }

  return false;
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

function formatMediaAlt(media: MessageMedia) {
  const fallbacks: Record<string, string> = {
    image: '对话图片',
    video: '对话视频',
    html: '网页预览',
    app: '应用预览',
    file: '文件',
  };
  return media.alt ?? media.title ?? fallbacks[media.kind] ?? media.kind;
}

function openFullscreen(event: MouseEvent) {
  const btn = event.currentTarget as HTMLButtonElement;
  const iframe = btn.closest('.message-app-wrapper')?.querySelector('iframe') as HTMLIFrameElement | null;
  if (!iframe) return;
  const req = iframe.requestFullscreen ?? (iframe as any).webkitRequestFullscreen;
  req?.call(iframe);
}

function formatFileSize(file: MessageFileAttachment) {
  return formatMessageFileSize(file.sizeBytes);
}

function formatFileType(file: MessageFileAttachment) {
  return formatMessageFileType(file.mimeType);
}

async function handleFileDownload(file: MessageFileAttachment) {
  if (!canDownloadFile(file.url)) {
    return;
  }

  try {
    await downloadMessageFile(file);
  } catch (error) {
    console.error(error);
  }
}
</script>

<template>
  <article class="message-card" :class="[props.message.role, formatAgentAccentClass(props.message, Boolean(props.multiAgentMode))]">
    <div class="message-topline" :class="{ compact: !showSpeakerIdentity }">
      <div v-if="showSpeakerIdentity" class="speaker-group">
        <strong>{{ formatSpeakerName(props.message, Boolean(props.multiAgentMode)) }}</strong>
        <span v-if="formatSpeakerMeta(props.message, Boolean(props.multiAgentMode))" class="speaker-meta">
          {{ formatSpeakerMeta(props.message, Boolean(props.multiAgentMode)) }}
        </span>
      </div>
      <span class="message-timestamp">{{ props.message.createdAt }}</span>
    </div>

    <details v-if="visibleReasoning" class="reasoning-block">
      <summary>思考过程</summary>
      <MarkdownContent :source="visibleReasoning" />
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
        <img
          v-if="media.kind === 'image'"
          class="message-image"
          :src="media.url"
          :alt="formatMediaAlt(media)"
          loading="lazy"
        />

        <video
          v-else-if="media.kind === 'video'"
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

        <template v-else-if="media.kind === 'html'">
          <iframe
            class="message-iframe"
            :src="media.url"
            :title="formatMediaAlt(media)"
            sandbox="allow-scripts"
            loading="lazy"
          />
        </template>

        <template v-else-if="media.kind === 'app'">
          <div class="message-app-wrapper">
            <iframe
              class="message-iframe"
              :src="media.url"
              :title="formatMediaAlt(media)"
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
        v-for="file in visibleFiles"
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
          <small>{{ formatFileType(file) }} · {{ formatFileSize(file) }}</small>
        </span>
        <span class="file-action">{{ file.canDownload ? '下载' : '不可下载' }}</span>
      </button>
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

.reasoning-block {
  margin-bottom: 9px;
  border: 1px dashed var(--color-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-surface-strong) 88%, white);
}

.reasoning-block:not([open]) {
  display: inline-flex;
  border-color: transparent;
  background: color-mix(in srgb, var(--color-bg-subtle) 70%, white);
}

.reasoning-block summary {
  cursor: pointer;
  list-style: none;
  padding: 9px 11px;
  color: var(--color-text);
  font-size: 0.78rem;
  font-weight: 700;
}

.reasoning-block:not([open]) summary {
  padding: 4px 8px;
}

.reasoning-block summary::-webkit-details-marker {
  display: none;
}

.reasoning-block :deep(.markdown-body) {
  padding: 0 14px 14px;
}

.status-copy {
  margin: 0;
  line-height: 1.55;
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
.message-video {
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

.message-action {
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
</style>
