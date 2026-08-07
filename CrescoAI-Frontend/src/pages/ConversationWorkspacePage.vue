<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import ConversationComposer from '../modules/conversation/ConversationComposer.vue';
import ConversationMessageCard from '../modules/conversation/ConversationMessageCard.vue';
import MobileRailTrigger from '../modules/navigation/MobileRailTrigger.vue';
import { findInteractiveReplyBoundary } from '../modules/conversation/interactiveReplyScroll';
import { shouldUseMultiAgentPresentation } from '../modules/conversation/messagePresentation';
import { useWorkspaceStore } from '../stores/workspace';
import { useProfileProductStore } from '../modules/profile/profileProductStore';
import type { AskQuestionResponse, DraftMessageSubmission, MessageAction } from '../types/entities';

const route = useRoute();
const router = useRouter();
const workspaceStore = useWorkspaceStore();
const profileProductStore = useProfileProductStore();
const {
  activeThread,
  errorMessage,
  messages,
  messagesStatus,
  messageSubmitStatus,
  messageSubmitThreadId,
} = storeToRefs(workspaceStore);
const minimumRunningIndicatorMs = 360;

const relatedThreadId = ref<string | null>(null);
const threadId = computed(() => route.params.threadId
  ? String(route.params.threadId)
  : relatedThreadId.value ?? '');
const multiAgentMode = computed(() => shouldUseMultiAgentPresentation(messages.value));
const messageRenderRevision = computed(() => messages.value.map((message) => [
  message.id,
  message.streaming ? 'streaming' : 'complete',
  message.content.length,
  message.stopReason ?? '',
  (message.blocks ?? []).map((block) => [
    block.id,
    block.type,
    block.status ?? '',
    block.toolUseId ?? '',
    block.text?.length ?? 0,
    block.questions?.length ?? 0,
    block.answers ? JSON.stringify(block.answers) : '',
  ].join(':')).join(','),
].join('|')).join('||'));
const localSubmitRunning = ref(false);
const localSubmitThreadId = ref<string | null>(null);
const isConversationRunning = computed(() => (
  messageSubmitThreadId.value === threadId.value
  || (localSubmitRunning.value && localSubmitThreadId.value === threadId.value)
));
const conversationScrollRegion = ref<HTMLElement | null>(null);
const interactiveScrollAnchor = ref<{ threadId: string; toolUseId: string } | null>(null);
let submitRunToken = 0;
let scrollRequestToken = 0;
let interactiveScrollAttemptToken = 0;

function cancelInteractiveScrollAttempt() {
  interactiveScrollAttemptToken += 1;
}

async function scrollConversationToBottom(behavior: ScrollBehavior = 'auto') {
  const requestToken = ++scrollRequestToken;
  await nextTick();

  if (requestToken !== scrollRequestToken) {
    return;
  }

  const scrollRegion = conversationScrollRegion.value;

  if (!scrollRegion) {
    return;
  }

  scrollRegion.scrollTo({
    top: scrollRegion.scrollHeight,
    behavior,
  });
}

function findMessageElement(messageId: string) {
  const scrollRegion = conversationScrollRegion.value;
  if (!scrollRegion) {
    return null;
  }

  return [...scrollRegion.querySelectorAll<HTMLElement>('[data-message-id]')]
    .find((element) => element.dataset.messageId === messageId) ?? null;
}

function findQuestionElement(messageElement: HTMLElement, toolUseId: string) {
  return [...messageElement.querySelectorAll<HTMLElement>('[data-ask-question-tool-use-id]')]
    .find((element) => element.dataset.askQuestionToolUseId === toolUseId) ?? null;
}

function findQuestionReplyUnit(questionElement: HTMLElement) {
  return questionElement.closest<HTMLElement>('[data-message-reply-unit]');
}

function findReplyUnitBeforeQuestion(questionElement: HTMLElement) {
  const questionReplyUnit = questionElement.closest<HTMLElement>('[data-message-reply-unit]');
  const previousReplyUnit = questionReplyUnit?.previousElementSibling;

  return previousReplyUnit instanceof HTMLElement
    && previousReplyUnit.matches('[data-message-reply-unit]')
    ? previousReplyUnit
    : null;
}

async function scrollToInteractiveReplyBoundary(
  boundary: ReturnType<typeof findInteractiveReplyBoundary>,
  toolUseId: string,
  options: { allowWhileRunning?: boolean } = {},
) {
  if (!boundary) {
    return false;
  }

  const requestToken = ++scrollRequestToken;
  await nextTick();

  if (requestToken !== scrollRequestToken) {
    return false;
  }

  if (!options.allowWhileRunning && isConversationRunning.value) {
    return false;
  }

  const scrollRegion = conversationScrollRegion.value;
  const questionElement = findMessageElement(boundary.questionMessageId);
  const questionCardElement = questionElement
    ? findQuestionElement(questionElement, toolUseId)
    : null;
  const questionReplyUnit = questionCardElement
    ? findQuestionReplyUnit(questionCardElement)
    : null;
  const previousReplyUnit = questionCardElement
    ? findReplyUnitBeforeQuestion(questionCardElement)
    : null;
  const continuationElement = boundary.continuationMessageId
    ? findMessageElement(boundary.continuationMessageId)
    : null;
  const targetElement = previousReplyUnit
    ?? questionReplyUnit
    ?? questionCardElement
    ?? continuationElement
    ?? questionElement;

  if (!scrollRegion || !targetElement) {
    return false;
  }

  const regionRect = scrollRegion.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const targetOffset = previousReplyUnit || questionReplyUnit || continuationElement
    ? Math.min(96, Math.max(32, scrollRegion.clientHeight * 0.12))
    : Math.max(24, (scrollRegion.clientHeight - targetRect.height) / 2);
  const top = scrollRegion.scrollTop + targetRect.top - regionRect.top - targetOffset;

  scrollRegion.scrollTo({
    top: Math.max(0, top),
    behavior: 'auto',
  });
  return true;
}

function restoreInteractiveScrollAnchorSoon() {
  const scrollAnchor = interactiveScrollAnchor.value;
  if (!scrollAnchor) {
    return;
  }

  window.setTimeout(() => {
    const currentAnchor = interactiveScrollAnchor.value;
    if (
      !currentAnchor
      || currentAnchor.threadId !== scrollAnchor.threadId
      || currentAnchor.toolUseId !== scrollAnchor.toolUseId
    ) {
      return;
    }

    const boundary = findInteractiveReplyBoundary(messages.value, scrollAnchor.toolUseId);
    void scrollToInteractiveReplyBoundary(boundary, scrollAnchor.toolUseId, { allowWhileRunning: true });
  }, 0);
}

watch(
  () => route.params.evidenceRef,
  async (evidenceRef) => {
    relatedThreadId.value = null;
    if (!evidenceRef) return;
    try {
      const navigation = await profileProductStore.resolveEvidenceNavigation(String(evidenceRef));
      relatedThreadId.value = navigation.threadId;
    } catch {
      workspaceStore.errorMessage = '对应的相关会话已不可用';
    }
  },
  { immediate: true },
);

watch(
  threadId,
  async (value) => {
    if (!value) return;
    cancelInteractiveScrollAttempt();
    interactiveScrollAnchor.value = null;
    const activeThreadId = await workspaceStore.setActiveThread(value);
    if (activeThreadId && activeThreadId !== value && route.name !== 'related-thread') {
      await router.replace(`/threads/${activeThreadId}`);
    }

    await scrollConversationToBottom();
  },
  { immediate: true },
);

watch(
  [messagesStatus, messageRenderRevision, isConversationRunning],
  async ([status, , running]) => {
    if (status !== 'ready') {
      cancelInteractiveScrollAttempt();
      return;
    }

    const scrollAnchor = interactiveScrollAnchor.value;
    if (scrollAnchor && scrollAnchor.threadId === threadId.value) {
      const attemptToken = ++interactiveScrollAttemptToken;
      if (running) {
        await nextTick();
      } else {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 240);
        });
      }

      if (
        attemptToken !== interactiveScrollAttemptToken
        || interactiveScrollAnchor.value?.toolUseId !== scrollAnchor.toolUseId
        || (!running && isConversationRunning.value)
      ) {
        return;
      }

      const boundary = findInteractiveReplyBoundary(messages.value, scrollAnchor.toolUseId);
      await scrollToInteractiveReplyBoundary(
        boundary,
        scrollAnchor.toolUseId,
        { allowWhileRunning: running },
      );

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
  cancelInteractiveScrollAttempt();
  scrollRequestToken += 1;
  interactiveScrollAnchor.value = null;
  localSubmitRunning.value = true;
  localSubmitThreadId.value = threadId.value;

  try {
    await workspaceStore.submitDraftMessage(submission);
  } finally {
    await waitForMinimumRunningTime(startedAt);

    if (currentToken === submitRunToken) {
      localSubmitRunning.value = false;
      localSubmitThreadId.value = null;
    }
  }
}

async function handleMessageAction(action: MessageAction) {
  if (action.kind !== 'open-artifact') {
    return;
  }

  await workspaceStore.openArtifact(action.artifactId, action.viewMode ?? 'pane');
}

async function handleQuestionResponse(toolUseId: string, response: AskQuestionResponse) {
  cancelInteractiveScrollAttempt();
  scrollRequestToken += 1;
  if (
    !interactiveScrollAnchor.value
    || interactiveScrollAnchor.value.threadId !== threadId.value
  ) {
    interactiveScrollAnchor.value = {
      threadId: threadId.value,
      toolUseId,
    };
  }

  try {
    await workspaceStore.respondToInteractiveTool(threadId.value, toolUseId, response);
    restoreInteractiveScrollAnchorSoon();
  } catch (error) {
    if (interactiveScrollAnchor.value?.toolUseId === toolUseId) {
      interactiveScrollAnchor.value = null;
    }
    throw error;
  }
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
            :data-message-id="message.id"
            :message="message"
            :multi-agent-mode="multiAgentMode"
            :respond-to-question="handleQuestionResponse"
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
  overflow-anchor: none;
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
