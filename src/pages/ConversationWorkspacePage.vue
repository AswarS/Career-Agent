<script setup lang="ts">
import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import ConversationComposer from '../modules/conversation/ConversationComposer.vue';
import ConversationMessageCard from '../modules/conversation/ConversationMessageCard.vue';
import { shouldUseMultiAgentPresentation } from '../modules/conversation/messagePresentation';
import { useWorkspaceStore } from '../stores/workspace';
import type { DraftMessageSubmission, MessageAction } from '../types/entities';

const route = useRoute();
const workspaceStore = useWorkspaceStore();
const { activeThread, errorMessage, messages, messagesStatus } = storeToRefs(workspaceStore);

const threadId = computed(() => String(route.params.threadId ?? 'thread-001'));
const multiAgentMode = computed(() => shouldUseMultiAgentPresentation(messages.value));

watch(
  threadId,
  async (value) => {
    await workspaceStore.setActiveThread(value);
  },
  { immediate: true },
);

function handleSubmit(submission: DraftMessageSubmission) {
  workspaceStore.submitDraftMessage(submission);
}

async function handleMessageAction(action: MessageAction) {
  if (action.kind !== 'open-artifact') {
    return;
  }

  await workspaceStore.openArtifact(action.artifactId, action.viewMode ?? 'pane');
}
</script>

<template>
  <section class="page-section conversation-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">对话工作台</p>
        <h1>{{ activeThread?.title ?? '正在加载会话...' }}</h1>
      </div>
      <p class="support-copy">
        从助手消息中的动作进入对应工作画布，逐步替代旧的调试型打开按钮。
      </p>
    </header>

    <section class="conversation-scroll-region" aria-label="会话消息">
      <section v-if="messagesStatus === 'loading'" class="state-card">
        <p class="eyebrow">加载中</p>
        <h2>正在加载会话消息...</h2>
      </section>

      <section v-else-if="messagesStatus === 'error'" class="state-card error">
        <p class="eyebrow">错误</p>
        <h2>消息加载失败。</h2>
        <p>{{ errorMessage ?? '发生未知会话错误。' }}</p>
      </section>

      <section v-else-if="messages.length === 0" class="state-card">
        <p class="eyebrow">空状态</p>
        <h2>这个会话还没有消息。</h2>
        <p>可以使用底部浮动输入区创建第一条本地草稿消息。</p>
      </section>

      <section v-else class="message-stream">
        <ConversationMessageCard
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :multi-agent-mode="multiAgentMode"
          @action="handleMessageAction"
        />
      </section>
    </section>

    <section class="composer-dock" aria-label="浮动输入区">
      <ConversationComposer :disabled="messagesStatus === 'loading'" @submit="handleSubmit" />
    </section>
  </section>
</template>

<style scoped>
@import './shared-page.css';

.conversation-page {
  height: calc(100vh - (var(--workspace-padding, 18px) * 2));
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}

.conversation-scroll-region {
  min-height: 0;
  overflow-y: auto;
  padding: 2px 6px 4px 0;
  scroll-padding-bottom: 24px;
}

.message-stream {
  display: grid;
  gap: 14px;
  align-content: start;
}

.composer-dock {
  position: sticky;
  bottom: 0;
  z-index: 5;
  padding-top: 14px;
  background:
    linear-gradient(180deg, rgba(243, 239, 231, 0), var(--color-bg) 42%),
    radial-gradient(circle at 18% 70%, rgba(217, 240, 235, 0.72), transparent 44%);
}

.composer-dock :deep(.composer-card) {
  border-color: color-mix(in srgb, var(--color-border-strong) 72%, transparent);
  background: color-mix(in srgb, var(--color-surface) 92%, white);
  box-shadow: 0 24px 70px rgba(35, 49, 59, 0.16);
  backdrop-filter: blur(18px);
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

.support-copy {
  max-width: 34rem;
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

</style>
