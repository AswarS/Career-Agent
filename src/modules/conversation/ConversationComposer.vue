<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type {
  DraftMessageAttachment,
  DraftMessageAttachmentKind,
  DraftMessageSubmission,
} from '../../types/entities';

const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  submit: [value: DraftMessageSubmission];
}>();

const imageFileExtensions = new Set([
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);

const draft = ref('');
const attachments = ref<DraftMessageAttachment[]>([]);
const attachmentInput = ref<HTMLInputElement | null>(null);

const canSubmit = computed(() => (
  !props.disabled && (draft.value.trim().length > 0 || attachments.value.length > 0)
));

function createAttachment(file: File, kind: DraftMessageAttachmentKind): DraftMessageAttachment {
  const randomValue = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: `local-attachment-${randomValue}`,
    kind,
    name: file.name,
    url: URL.createObjectURL(file),
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  };
}

function inferAttachmentKind(file: File): DraftMessageAttachmentKind {
  if (file.type.startsWith('image/')) {
    return 'image';
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return imageFileExtensions.has(extension) ? 'image' : 'file';
}

function handleAttachmentSelection(event: Event) {
  const input = event.target as HTMLInputElement;
  const selectedFiles = Array.from(input.files ?? []);

  const nextAttachments = selectedFiles.map((file) => createAttachment(file, inferAttachmentKind(file)));

  attachments.value = [...attachments.value, ...nextAttachments];
  input.value = '';
}

function removeAttachment(attachmentId: string) {
  const attachment = attachments.value.find((item) => item.id === attachmentId);
  if (attachment) {
    URL.revokeObjectURL(attachment.url);
  }

  attachments.value = attachments.value.filter((item) => item.id !== attachmentId);
}

function formatAttachmentSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAttachmentType(attachment: DraftMessageAttachment) {
  if (attachment.kind === 'image') {
    return attachment.mimeType.replace('image/', '').toUpperCase() || 'IMAGE';
  }

  if (attachment.mimeType === 'application/octet-stream') {
    return '本地文件';
  }

  const [, subtype] = attachment.mimeType.split('/');
  return subtype?.toUpperCase() ?? '本地文件';
}

function handleSubmit() {
  if (!canSubmit.value) {
    return;
  }

  emit('submit', {
    content: draft.value.trim(),
    attachments: [...attachments.value],
  });

  draft.value = '';
  attachments.value = [];
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
    return;
  }

  event.preventDefault();
  handleSubmit();
}

onBeforeUnmount(() => {
  for (const attachment of attachments.value) {
    URL.revokeObjectURL(attachment.url);
  }
});
</script>

<template>
  <div class="composer-card">
    <input
      ref="attachmentInput"
      class="hidden-file-input"
      type="file"
      multiple
      :disabled="disabled"
      @change="handleAttachmentSelection"
    />

    <textarea
      v-model="draft"
      class="composer-input"
      :disabled="disabled"
      aria-label="消息输入框"
      placeholder="有问题，尽管问"
      @keydown="handleComposerKeydown"
    ></textarea>

    <div v-if="attachments.length" class="attachment-tray" aria-label="待发送附件">
      <div class="attachment-tray-head">
        <strong>待发送附件</strong>
        <span>{{ attachments.length }} 个</span>
      </div>

      <div class="attachment-grid">
        <article
          v-for="attachment in attachments"
          :key="attachment.id"
          class="attachment-card"
          :class="attachment.kind"
        >
          <div v-if="attachment.kind === 'image'" class="attachment-preview">
            <img :src="attachment.url" :alt="attachment.name" loading="lazy" />
          </div>
          <div v-else class="attachment-file-mark" aria-hidden="true">
            FILE
          </div>

          <div class="attachment-meta">
            <span>{{ attachment.kind === 'image' ? '图片预览' : '文件附件' }}</span>
            <strong>{{ attachment.name }}</strong>
            <small>{{ formatAttachmentType(attachment) }} · {{ formatAttachmentSize(attachment.sizeBytes) }}</small>
          </div>

          <button
            type="button"
            class="remove-attachment"
            :aria-label="`移除 ${attachment.name}`"
            @click="removeAttachment(attachment.id)"
          >
            移除
          </button>
        </article>
      </div>
    </div>

    <div class="composer-footer">
      <div class="composer-tools">
        <button
          type="button"
          class="tool-button"
          :disabled="disabled"
          aria-label="添加图片或文件"
          title="添加图片或文件"
          @click="attachmentInput?.click()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>
      <button type="button" class="primary-button" :disabled="!canSubmit" aria-label="发送" @click="handleSubmit">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.composer-card {
  position: relative;
  display: grid;
  gap: 10px;
  padding: 16px 18px 14px;
  border-radius: 28px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  box-shadow: 0 14px 34px rgba(24, 31, 38, 0.08);
}

.composer-tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tool-button,
.primary-button {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0;
  font: inherit;
  font-weight: 700;
  transition:
    background 160ms ease,
    color 160ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}

.tool-button svg,
.primary-button svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tool-button {
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.tool-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-surface-strong) 78%, var(--color-bg));
}

.tool-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.hidden-file-input {
  display: none;
}

.composer-input {
  min-height: 58px;
  max-height: 130px;
  resize: none;
  border: 0;
  border-radius: 0;
  padding: 6px 0 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 1rem;
  line-height: 1.45;
  outline: none;
}

.composer-input::placeholder {
  color: color-mix(in srgb, var(--color-text-muted) 72%, white);
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.attachment-tray {
  display: grid;
  gap: 8px;
  padding: 9px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface-strong) 82%, var(--color-bg));
}

.attachment-tray-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 2px;
}

.attachment-tray-head strong {
  color: var(--color-text);
  font-size: 0.8rem;
  font-weight: 800;
}

.attachment-tray-head span {
  color: var(--color-text-muted);
  font-size: 0.72rem;
}

.attachment-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.attachment-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  flex: 1 1 230px;
  max-width: 360px;
  min-width: 0;
  padding: 9px 9px 34px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface-strong);
  box-shadow: none;
}

.attachment-card.image {
  flex-basis: 220px;
  background: var(--color-surface-strong);
}

.attachment-card.file {
  background: var(--color-surface-strong);
}

.attachment-preview,
.attachment-file-mark {
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.attachment-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.attachment-file-mark {
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--color-secondary-soft) 68%, var(--color-surface-strong));
  color: var(--color-text-muted);
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.attachment-meta {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.attachment-meta span {
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 900;
}

.attachment-meta strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.8rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-meta small {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-attachment {
  position: absolute;
  right: 10px;
  bottom: 9px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.24rem 0.58rem;
  background: var(--color-surface-strong);
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
}

.remove-attachment:hover {
  border-color: color-mix(in srgb, var(--color-danger) 46%, var(--color-border));
  color: var(--color-danger);
}

.primary-button {
  border: 0;
  background: var(--color-text);
  color: var(--color-on-primary);
  cursor: pointer;
}

.primary-button:disabled {
  background: color-mix(in srgb, var(--color-surface-strong) 82%, var(--color-bg));
  color: var(--color-text-muted);
  opacity: 0.76;
  cursor: not-allowed;
}

@media (max-width: 860px) {
  .composer-card {
    border-radius: 24px;
    padding: 14px;
  }

  .attachment-grid {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
