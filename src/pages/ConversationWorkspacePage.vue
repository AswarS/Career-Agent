<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import ConversationComposer from '../modules/conversation/ConversationComposer.vue';
import ConversationMessageCard from '../modules/conversation/ConversationMessageCard.vue';
import MobileRailTrigger from '../modules/navigation/MobileRailTrigger.vue';
import { shouldUseMultiAgentPresentation } from '../modules/conversation/messagePresentation';
import { useWorkspaceStore } from '../stores/workspace';
import type { DraftMessageSubmission, MessageAction } from '../types/entities';

const route = useRoute();
const router = useRouter();
const workspaceStore = useWorkspaceStore();
const { activeThread, errorMessage, messages, messagesStatus } = storeToRefs(workspaceStore);

const threadId = computed(() => String(route.params.threadId ?? 'thread-001'));
const multiAgentMode = computed(() => shouldUseMultiAgentPresentation(messages.value));
const conversationScrollRegion = ref<HTMLElement | null>(null);

watch(
  threadId,
  async (value) => {
    const activeThreadId = await workspaceStore.setActiveThread(value);
    if (activeThreadId && activeThreadId !== value) {
      await router.replace(`/threads/${activeThreadId}`);
    }
  },
  { immediate: true },
);

watch(
  [messagesStatus, () => messages.value.length],
  async ([status]) => {
    if (status !== 'ready') {
      return;
    }

    await nextTick();
    conversationScrollRegion.value?.scrollTo({
      top: conversationScrollRegion.value.scrollHeight,
    });
  },
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
    <header class="page-header thread-page-header">
      <div class="page-heading">
        <MobileRailTrigger />
        <h1>{{ activeThread?.title ?? '正在加载会话...' }}</h1>
      </div>
    </header>

    <section ref="conversationScrollRegion" class="conversation-scroll-region" aria-label="会话消息">
      <div class="conversation-scroll-content">
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
          <p class="eyebrow">空会话</p>
          <h2>输入消息开始规划。</h2>
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
      </div>
    </section>

    <section class="composer-dock" aria-label="浮动输入区">
      <ConversationComposer :disabled="messagesStatus === 'loading'" @submit="handleSubmit" />
    </section>
  </section>
</template>

<style scoped>
@import './shared-page.css';

.conversation-page {
  height: 100vh;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  padding: 16px 0 0;
}

.conversation-page > .page-header {
  margin: 0 18px;
}

.thread-page-header {
  justify-content: flex-start;
  align-items: center;
}

.conversation-scroll-region {
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scroll-padding-bottom: 10px;
}

.conversation-scroll-content {
  padding: 10px clamp(18px, 9vw, 176px) 6px;
}

.message-stream {
  display: grid;
  gap: 12px;
  align-content: start;
}

.composer-dock {
  display: flex;
  justify-content: center;
  position: relative;
  z-index: 5;
  padding: 6px 18px 16px;
  background: var(--color-bg);
}

.composer-dock :deep(.composer-card) {
  width: min(1040px, 68vw);
  max-width: calc(100vw - 36px);
  border-color: var(--color-border-strong);
  background: var(--color-surface-strong);
  box-shadow: 0 8px 30px rgba(32, 36, 42, 0.1);
}

.state-card {
  padding: 16px;
  border-radius: 16px;
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
  font-size: 1.08rem;
}

.state-card p:not(.eyebrow) {
  margin: 10px 0 0;
  color: var(--color-text-muted);
  line-height: 1.45;
}

.support-copy {
  max-width: 34rem;
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.45;
}

@media (max-width: 960px) {
  .conversation-page {
    padding-top: 10px;
  }

  .conversation-page > .page-header {
    margin: 0 12px;
  }

  .conversation-scroll-content {
    padding-inline: 12px;
  }

  .composer-dock {
    padding-inline: 12px;
  }

  .composer-dock :deep(.composer-card) {
    width: min(760px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
  }
}

@media (max-width: 640px) {
  .composer-dock :deep(.composer-card) {
    width: calc(100vw - 24px);
  }
}

</style>
