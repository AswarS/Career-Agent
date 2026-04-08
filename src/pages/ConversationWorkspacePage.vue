<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useWorkspaceStore } from '../stores/workspace';

const route = useRoute();
const workspaceStore = useWorkspaceStore();
const { activeThread, messages } = storeToRefs(workspaceStore);

const threadId = computed(() => String(route.params.threadId ?? 'thread-001'));

onMounted(async () => {
  await workspaceStore.setActiveThread(threadId.value);
});

watch(threadId, async (value) => {
  await workspaceStore.setActiveThread(value);
});
</script>

<template>
  <section class="page-section">
    <header class="page-header">
      <div>
        <p class="eyebrow">Conversation Workspace</p>
        <h1>{{ activeThread?.title ?? 'Loading thread...' }}</h1>
      </div>
      <div class="action-group">
        <button class="secondary-button" @click="workspaceStore.openArtifact('artifact-profile-summary')">
          Open Profile Summary
        </button>
        <button class="primary-button" @click="workspaceStore.openArtifact('artifact-weekly-plan')">
          Open Weekly Plan
        </button>
      </div>
    </header>

    <section class="message-stream">
      <article v-for="message in messages" :key="message.id" class="message-card" :class="message.role">
        <div class="message-topline">
          <strong>{{ message.role }}</strong>
          <span>{{ message.createdAt }}</span>
        </div>
        <p>{{ message.content }}</p>
      </article>
    </section>

    <section class="composer-card">
      <p class="eyebrow">Composer Placeholder</p>
      <h2>Text, markdown, and image preview enter here in later passes.</h2>
      <p>
        Voice remains phase 2. Backend interaction is still mock-driven through typed adapters.
      </p>
    </section>
  </section>
</template>

<style scoped>
@import './shared-page.css';

.message-stream {
  display: grid;
  gap: 14px;
}

.message-card,
.composer-card {
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.message-card.assistant {
  background: color-mix(in srgb, var(--color-primary-soft) 46%, white);
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

.message-card p,
.composer-card p {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.composer-card h2 {
  margin: 0 0 12px;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1.32rem;
}

.action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.primary-button,
.secondary-button {
  border-radius: 999px;
  padding: 0.85rem 1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  border: 0;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  color: var(--color-on-primary);
}

.secondary-button {
  border: 1px solid var(--color-border);
  background: var(--color-surface-strong);
  color: var(--color-text);
}
</style>
