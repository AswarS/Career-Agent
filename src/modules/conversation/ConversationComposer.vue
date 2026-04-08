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
  <section class="composer-card">
    <div class="composer-head">
      <div>
        <p class="eyebrow">Composer</p>
        <h2>Text-first input, with multimodal controls reserved.</h2>
      </div>
      <div class="composer-tools">
        <button type="button" class="tool-button" disabled>Image</button>
        <button type="button" class="tool-button" disabled>Voice</button>
      </div>
    </div>

    <textarea
      v-model="draft"
      class="composer-input"
      :disabled="disabled"
      aria-label="Message"
      placeholder="Describe the next career planning task or ask the agent to open an artifact..."
    ></textarea>

    <div class="composer-footer">
      <p class="support-copy">
        Current behavior is mock-driven. Submission appends a local draft turn and preserves frontend contract boundaries.
      </p>
      <button type="button" class="primary-button" :disabled="!canSubmit" @click="handleSubmit">
        Send
      </button>
    </div>
  </section>
</template>

<style scoped>
.composer-card {
  display: grid;
  gap: 14px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.composer-head,
.composer-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1.2rem;
  line-height: 1.15;
}

.composer-tools {
  display: flex;
  gap: 8px;
}

.tool-button,
.primary-button {
  border-radius: 999px;
  padding: 0.72rem 0.95rem;
  font: inherit;
  font-weight: 700;
}

.tool-button {
  border: 1px solid var(--color-border);
  background: var(--color-surface-strong);
  color: var(--color-text-muted);
}

.composer-input {
  min-height: 132px;
  resize: vertical;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  padding: 14px 16px;
  background: var(--color-surface-strong);
  color: var(--color-text);
}

.support-copy {
  max-width: 52ch;
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.6;
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
