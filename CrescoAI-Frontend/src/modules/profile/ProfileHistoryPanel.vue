<script setup lang="ts">
import type { ProfileRevisionRecord } from './profileV2Types';

defineProps<{ history: ProfileRevisionRecord[] }>();
</script>

<template>
  <details class="history-panel">
    <summary>Profile 变更历史（{{ history.length }}）</summary>
    <div class="history-list">
      <article v-for="revision in history" :key="revision.id">
        <strong>v{{ revision.aggregateVersion }} · {{ revision.operation }}</strong>
        <span>{{ revision.targetType }} · {{ revision.sourceType }} · {{ revision.updateLevel }}</span>
        <small>{{ new Date(revision.createdAt).toLocaleString() }}<template v-if="revision.sourceConversationId"> · 会话 {{ revision.sourceConversationId }}</template></small>
      </article>
      <p v-if="!history.length">暂无变更历史。</p>
    </div>
  </details>
</template>

<style scoped>
.history-panel { padding: 16px; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-surface); }
summary { cursor: pointer; font-weight: 700; }
.history-list { display: grid; gap: 8px; margin-top: 12px; }
article { display: grid; gap: 4px; padding: 10px 12px; border-radius: 10px; background: var(--color-bg-subtle); }
span, small, p { color: var(--color-text-muted); }
</style>
