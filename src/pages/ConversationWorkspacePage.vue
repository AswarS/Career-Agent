<script setup lang="ts">
import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import ConversationComposer from '../modules/conversation/ConversationComposer.vue';
import ConversationMessageCard from '../modules/conversation/ConversationMessageCard.vue';
import { shouldUseMultiAgentPresentation } from '../modules/conversation/messagePresentation';
import { useWorkspaceStore } from '../stores/workspace';
import type { MessageAction } from '../types/entities';

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

function handleSubmit(value: string) {
  workspaceStore.submitDraftMessage(value);
}

async function handleMessageAction(action: MessageAction) {
  if (action.kind !== 'open-artifact') {
    return;
  }

  await workspaceStore.openArtifact(action.artifactId, action.viewMode ?? 'pane');
}
</script>

<template>
  <section class="page-section">
    <header class="page-header">
      <div>
        <p class="eyebrow">对话工作台</p>
        <h1>{{ activeThread?.title ?? '正在加载会话...' }}</h1>
      </div>
      <p class="support-copy">
        从助手消息中的动作进入对应工作画布，逐步替代旧的调试型打开按钮。
      </p>
    </header>

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
      <p>可以使用下方输入区创建第一条本地草稿消息。</p>
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

.support-copy {
  max-width: 34rem;
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}
</style>
