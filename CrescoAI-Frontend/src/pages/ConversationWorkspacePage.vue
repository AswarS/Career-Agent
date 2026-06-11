<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
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
const { activeThread, errorMessage, messages, messagesStatus, messageSubmitStatus } = storeToRefs(workspaceStore);
const minimumRunningIndicatorMs = 360;

const threadId = computed(() => String(route.params.threadId ?? 'thread-001'));
const multiAgentMode = computed(() => shouldUseMultiAgentPresentation(messages.value));
const localSubmitRunning = ref(false);
const isConversationRunning = computed(() => messageSubmitStatus.value === 'loading' || localSubmitRunning.value);
const conversationScrollRegion = ref<HTMLElement | null>(null);
let submitRunToken = 0;

async function scrollConversationToBottom(behavior: ScrollBehavior = 'auto') {
  await nextTick();
  const scrollRegion = conversationScrollRegion.value;

  if (!scrollRegion) {
    return;
  }

  scrollRegion.scrollTo({
    top: scrollRegion.scrollHeight,
    behavior,
  });
}

watch(
  threadId,
  async (value) => {
    const activeThreadId = await workspaceStore.setActiveThread(value);
    if (activeThreadId && activeThreadId !== value) {
      await router.replace(`/threads/${activeThreadId}`);
    }

    await scrollConversationToBottom();
  },
  { immediate: true },
);

watch(
  [messagesStatus, () => messages.value.length, isConversationRunning],
  async ([status]) => {
    if (status !== 'ready') {
      return;
    }

    await scrollConversationToBottom();
  },
);

onMounted(() => {
  void scrollConversationToBottom();
});

function waitForMinimumRunningTime(startedAt: number) {
  const elapsedMs = Date.now() - startedAt;
  const remainingMs = Math.max(0, minimumRunningIndicatorMs - elapsedMs);

  return new Promise((resolve) => {
    window.setTimeout(resolve, remainingMs);
  });
}

async function handleSubmit(submission: DraftMessageSubmission) {
  const currentToken = ++submitRunToken;
  const startedAt = Date.now();
  localSubmitRunning.value = true;

  try {
    await workspaceStore.submitDraftMessage(submission);
  } finally {
    await waitForMinimumRunningTime(startedAt);

    if (currentToken === submitRunToken) {
      localSubmitRunning.value = false;
    }
  }
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

          <div v-if="isConversationRunning" class="running-indicator" role="status" aria-live="polite" aria-label="对话正在运行">
            <span class="running-dots" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span>思考中</span>
          </div>
        </section>
      </div>
    </section>

    <section class="composer-dock" aria-label="浮动输入区">
      <ConversationComposer :disabled="messagesStatus === 'loading' || messageSubmitStatus === 'loading'" @submit="handleSubmit" />
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

.running-indicator {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  margin-top: 2px;
  padding: 9px 12px;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-primary);
  border-radius: 14px;
  border-top-left-radius: 5px;
  border-bottom-left-radius: 5px;
  background: var(--color-surface-strong);
  color: var(--color-text-muted);
  font-size: 0.86rem;
  font-weight: 700;
}

.running-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.running-dots span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--color-primary);
  opacity: 0.36;
  animation: running-dot 920ms ease-in-out infinite;
}

.running-dots span:nth-child(2) {
  animation-delay: 140ms;
}

.running-dots span:nth-child(3) {
  animation-delay: 280ms;
}

@keyframes running-dot {
  0%,
  80%,
  100% {
    opacity: 0.34;
    transform: translateY(0);
  }

  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
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
