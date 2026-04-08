<script setup lang="ts">
import MarkdownContent from '../../components/MarkdownContent.vue';
import type { ThreadMessage } from '../../types/entities';

defineProps<{
  message: ThreadMessage;
}>();
</script>

<template>
  <article class="message-card" :class="message.role">
    <div class="message-topline">
      <strong>{{ message.role }}</strong>
      <span>{{ message.createdAt }}</span>
    </div>

    <MarkdownContent v-if="message.kind === 'markdown'" :source="message.content" />
    <p v-else class="status-copy">{{ message.content }}</p>
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

.message-topline span {
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

.status-copy {
  margin: 0;
  line-height: 1.7;
}
</style>
