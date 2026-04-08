<script setup lang="ts">
import { computed } from 'vue';
import type { ProfileSuggestion } from '../../types/entities';

const props = defineProps<{
  suggestion: ProfileSuggestion;
  sourceLabel?: string | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  apply: [suggestion: ProfileSuggestion];
}>();

function buildPatchPreviewLines(suggestion: ProfileSuggestion) {
  return Object.entries(suggestion.patch).map(([key, value]) => ({
    key,
    value: Array.isArray(value) ? value.join(', ') : value,
  }));
}

const previewLines = computed(() => buildPatchPreviewLines(props.suggestion));
</script>

<template>
  <article class="suggestion-card">
    <div class="card-head">
      <div>
        <p class="eyebrow">Suggestion</p>
        <h2>{{ suggestion.title }}</h2>
      </div>
      <span v-if="sourceLabel" class="source-chip">{{ sourceLabel }}</span>
    </div>

    <p class="rationale-copy">{{ suggestion.rationale }}</p>

    <div class="patch-list">
      <div v-for="line in previewLines" :key="line.key" class="patch-item">
        <strong>{{ line.key }}</strong>
        <span>{{ line.value }}</span>
      </div>
    </div>

    <button type="button" class="secondary-button" :disabled="disabled" @click="emit('apply', suggestion)">
      Apply To Draft
    </button>
  </article>
</template>

<style scoped>
.suggestion-card {
  display: grid;
  gap: 14px;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-primary-soft) 34%, white);
  box-shadow: var(--shadow-card);
}

.card-head {
  display: flex;
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
  font-size: 1.18rem;
  line-height: 1.15;
}

.source-chip {
  align-self: flex-start;
  padding: 0.38rem 0.62rem;
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.rationale-copy {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.65;
}

.patch-list {
  display: grid;
  gap: 10px;
}

.patch-item {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
}

.patch-item strong {
  color: var(--color-text);
  font-size: 0.82rem;
  text-transform: capitalize;
}

.patch-item span {
  color: var(--color-text-muted);
  line-height: 1.55;
}

.secondary-button {
  justify-self: flex-start;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0.78rem 0.98rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.secondary-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 860px) {
  .card-head {
    flex-direction: column;
  }
}
</style>
