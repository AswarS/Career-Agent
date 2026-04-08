<script setup lang="ts">
import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import ConversationComposer from '../modules/conversation/ConversationComposer.vue';
import ConversationMessageCard from '../modules/conversation/ConversationMessageCard.vue';
import { useWorkspaceStore } from '../stores/workspace';

const route = useRoute();
const workspaceStore = useWorkspaceStore();
const { activeThread, errorMessage, messages, messagesStatus } = storeToRefs(workspaceStore);

const threadId = computed(() => String(route.params.threadId ?? 'thread-001'));

watch(
  threadId,
  async (value) => {
    await workspaceStore.setActiveThread(value);
  },
  { immediate: true },
);

function handleSubmit(value: string) {
  workspaceStore.submitDraftMessage(value);
}
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

    <section v-if="messagesStatus === 'loading'" class="state-card">
      <p class="eyebrow">Loading</p>
      <h2>Loading thread messages...</h2>
    </section>

    <section v-else-if="messagesStatus === 'error'" class="state-card error">
      <p class="eyebrow">Error</p>
      <h2>Messages could not be loaded.</h2>
      <p>{{ errorMessage ?? 'Unknown conversation error.' }}</p>
    </section>

    <section v-else-if="messages.length === 0" class="state-card">
      <p class="eyebrow">Empty</p>
      <h2>This thread has no messages yet.</h2>
      <p>Use the composer below to create the first local draft turn.</p>
    </section>

    <section v-else class="message-stream">
      <ConversationMessageCard v-for="message in messages" :key="message.id" :message="message" />
    </section>

    <ConversationComposer :disabled="messagesStatus === 'loading'" @submit="handleSubmit" />
  </section>
</template>

<style scoped>
@import './shared-page.css';

.message-stream {
  display: grid;
  gap: 14px;
}

.state-card {
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.state-card.error {
  background: color-mix(in srgb, var(--color-warning-soft) 62%, white);
}

.state-card h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1.32rem;
}

.state-card p:not(.eyebrow) {
  margin: 10px 0 0;
  color: var(--color-text-muted);
  line-height: 1.7;
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

@media (max-width: 860px) {
  .action-group {
    width: 100%;
  }
}
</style>
