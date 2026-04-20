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

    <div v-if="attachments.length" class="attachment-list" aria-label="待发送附件">
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="attachment-chip"
      >
        <span class="attachment-kind">{{ attachment.kind === 'image' ? '图片' : '文件' }}</span>
        <span class="attachment-name">{{ attachment.name }}</span>
        <span class="attachment-size">{{ formatAttachmentSize(attachment.sizeBytes) }}</span>
        <button type="button" class="remove-attachment" @click="removeAttachment(attachment.id)">
          移除
        </button>
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

.attachment-list {
  display: grid;
  gap: 8px;
}

.attachment-chip {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-surface-strong) 86%, white);
}

.attachment-kind {
  border-radius: 999px;
  padding: 0.2rem 0.48rem;
  background: color-mix(in srgb, var(--color-primary-soft) 72%, white);
  color: var(--color-text);
  font-size: 0.74rem;
  font-weight: 800;
}

.attachment-name {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.86rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-size {
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.remove-attachment {
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 800;
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
}
</style>
