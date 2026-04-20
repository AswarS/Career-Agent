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

const draft = ref('');
const attachments = ref<DraftMessageAttachment[]>([]);
const imageInput = ref<HTMLInputElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

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

function handleAttachmentSelection(event: Event, kind: DraftMessageAttachmentKind) {
  const input = event.target as HTMLInputElement;
  const selectedFiles = Array.from(input.files ?? []);

  const nextAttachments = selectedFiles
    .filter((file) => kind !== 'image' || file.type.startsWith('image/'))
    .map((file) => createAttachment(file, kind));

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

onBeforeUnmount(() => {
  for (const attachment of attachments.value) {
    URL.revokeObjectURL(attachment.url);
  }
});
</script>

<template>
  <div class="composer-card">
    <div class="composer-head">
      <p class="eyebrow">输入区</p>
      <div class="composer-tools">
        <button type="button" class="tool-button" :disabled="disabled" @click="imageInput?.click()">
          图片
        </button>
        <button type="button" class="tool-button" :disabled="disabled" @click="fileInput?.click()">
          文件
        </button>
      </div>
    </div>

    <input
      ref="imageInput"
      class="hidden-file-input"
      type="file"
      accept="image/*"
      multiple
      :disabled="disabled"
      @change="handleAttachmentSelection($event, 'image')"
    />
    <input
      ref="fileInput"
      class="hidden-file-input"
      type="file"
      multiple
      :disabled="disabled"
      @change="handleAttachmentSelection($event, 'file')"
    />

    <textarea
      v-model="draft"
      class="composer-input"
      :disabled="disabled"
      aria-label="消息输入框"
      placeholder="输入下一步职业规划任务，或要求助手打开某个工件..."
    ></textarea>

    <div v-if="attachments.length" class="attachment-tray" aria-label="待发送附件">
      <div class="attachment-tray-head">
        <strong>待发送附件</strong>
        <span>{{ attachments.length }} 个，本地预览</span>
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
      <p class="support-copy">
        图片和文件会先作为本地附件预览；真实上传接口接通后再改为服务端资产引用。
      </p>
      <button type="button" class="primary-button" :disabled="!canSubmit" @click="handleSubmit">
        发送
      </button>
    </div>
  </div>
</template>

<style scoped>
.composer-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.composer-head,
.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.composer-tools {
  display: flex;
  gap: 8px;
}

.tool-button,
.primary-button {
  border-radius: 999px;
  padding: 0.58rem 0.86rem;
  font: inherit;
  font-weight: 700;
}

.tool-button {
  border: 1px solid var(--color-border);
  background: var(--color-surface-strong);
  color: var(--color-text-muted);
  cursor: pointer;
}

.tool-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.hidden-file-input {
  display: none;
}

.composer-input {
  min-height: 76px;
  max-height: 180px;
  resize: vertical;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  padding: 12px 14px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  line-height: 1.55;
}

.attachment-tray {
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--color-border) 84%, var(--color-primary));
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.48), rgba(255, 250, 242, 0.18)),
    color-mix(in srgb, var(--color-primary-soft) 18%, var(--color-surface-strong));
}

.attachment-tray-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 2px;
}

.attachment-tray-head strong {
  color: var(--color-text);
  font-size: 0.84rem;
  font-weight: 800;
}

.attachment-tray-head span {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.attachment-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.attachment-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  flex: 1 1 230px;
  max-width: 360px;
  min-width: 0;
  padding: 10px 10px 38px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, white);
  border-radius: 18px;
  background: rgba(255, 252, 247, 0.88);
  box-shadow: 0 12px 32px rgba(35, 49, 59, 0.06);
}

.attachment-card.image {
  flex-basis: 220px;
  background:
    radial-gradient(circle at 14% 0%, rgba(29, 115, 109, 0.16), transparent 42%),
    rgba(255, 252, 247, 0.9);
}

.attachment-card.file {
  background:
    radial-gradient(circle at 10% 0%, rgba(216, 143, 72, 0.18), transparent 44%),
    rgba(255, 252, 247, 0.9);
}

.attachment-preview,
.attachment-file-mark {
  width: 58px;
  height: 58px;
  overflow: hidden;
  border-radius: 15px;
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
  background:
    linear-gradient(155deg, color-mix(in srgb, var(--color-secondary-soft) 78%, white), var(--color-surface-strong));
  color: var(--color-secondary-strong);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.attachment-meta {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.attachment-meta span {
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 900;
}

.attachment-meta strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.86rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-meta small {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-attachment {
  position: absolute;
  right: 10px;
  bottom: 9px;
  border: 1px solid color-mix(in srgb, var(--color-border) 78%, var(--color-primary));
  border-radius: 999px;
  padding: 0.24rem 0.58rem;
  background: rgba(255, 252, 247, 0.8);
  color: var(--color-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 800;
}

.remove-attachment:hover {
  border-color: color-mix(in srgb, var(--color-danger) 46%, var(--color-border));
  color: var(--color-danger);
}

.support-copy {
  max-width: 52ch;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

.primary-button {
  border: 0;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  color: var(--color-on-primary);
  cursor: pointer;
}

.primary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 860px) {
  .composer-head,
  .composer-footer {
    flex-direction: column;
  }

  .attachment-grid {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
