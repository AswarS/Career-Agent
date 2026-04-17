<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  submit: [value: string];
}>();

const draft = ref('');

const canSubmit = computed(() => !props.disabled && draft.value.trim().length > 0);

function handleSubmit() {
  if (!canSubmit.value) {
    return;
  }

  emit('submit', draft.value.trim());
  draft.value = '';
}
</script>

<template>
  <div class="composer-card">
    <div class="composer-head">
      <p class="eyebrow">输入区</p>
      <div class="composer-tools">
        <button type="button" class="tool-button" disabled>图片</button>
        <button type="button" class="tool-button" disabled>语音</button>
      </div>
    </div>

    <textarea
      v-model="draft"
      class="composer-input"
      :disabled="disabled"
      aria-label="消息输入框"
      placeholder="输入下一步职业规划任务，或要求助手打开某个工件..."
    ></textarea>

    <div class="composer-footer">
      <p class="support-copy">
        文本输入已启用，图片和语音入口暂时预留；发送后会追加本地草稿消息。
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
