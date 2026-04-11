<script setup lang="ts">
import { computed } from 'vue';
import MarkdownContent from '../../components/MarkdownContent.vue';
import type { MessageAction, ThreadMessage } from '../../types/entities';
import { getPresentedMessageContent } from './messagePresentation';

const props = defineProps<{
  message: ThreadMessage;
  multiAgentMode?: boolean;
}>();

const emit = defineEmits<{
  action: [action: MessageAction];
}>();

const presentedMessage = computed(() => getPresentedMessageContent(props.message));
const visibleActions = computed(() => props.message.role === 'assistant' ? props.message.actions ?? [] : []);

function formatRoleLabel(role: ThreadMessage['role']) {
  switch (role) {
    case 'user':
      return '用户';
    case 'assistant':
      return '助手';
    case 'system':
      return '系统';
    default:
      return role;
  }
}

function formatSpeakerName(message: ThreadMessage, multiAgentMode: boolean) {
  if (!multiAgentMode) {
    return formatRoleLabel(message.role);
  }

  return message.agentName ?? formatRoleLabel(message.role);
}

function formatSpeakerMeta(message: ThreadMessage, multiAgentMode: boolean) {
  if (!multiAgentMode || !message.agentName) {
    return null;
  }

  return formatRoleLabel(message.role);
}

function formatAgentAccentClass(message: ThreadMessage, multiAgentMode: boolean) {
  if (!multiAgentMode || !message.agentAccent) {
    return null;
  }

  return `agent-${message.agentAccent}`;
}

function handleAction(action: MessageAction) {
  emit('action', action);
}
</script>

<template>
  <article class="message-card" :class="[props.message.role, formatAgentAccentClass(props.message, Boolean(props.multiAgentMode))]">
    <div class="message-topline">
      <div class="speaker-group">
        <strong>{{ formatSpeakerName(props.message, Boolean(props.multiAgentMode)) }}</strong>
        <span v-if="formatSpeakerMeta(props.message, Boolean(props.multiAgentMode))" class="speaker-meta">
          {{ formatSpeakerMeta(props.message, Boolean(props.multiAgentMode)) }}
        </span>
      </div>
      <span>{{ props.message.createdAt }}</span>
    </div>

    <details v-if="presentedMessage.reasoning" class="reasoning-block">
      <summary>查看思考过程</summary>
      <MarkdownContent :source="presentedMessage.reasoning" />
    </details>

    <MarkdownContent v-if="props.message.kind === 'markdown'" :source="presentedMessage.content" />
    <p v-else class="status-copy">{{ presentedMessage.content }}</p>

    <div v-if="visibleActions.length" class="message-actions">
      <button
        v-for="action in visibleActions"
        :key="action.id"
        type="button"
        class="message-action"
        @click="handleAction(action)"
      >
        {{ action.label }}
      </button>
    </div>
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

.message-card.assistant.agent-amber {
  background: color-mix(in srgb, var(--color-warning-soft) 52%, white);
}

.message-card.assistant.agent-blue {
  background: color-mix(in srgb, rgba(71, 110, 163, 0.16) 72%, white);
}

.message-card.assistant.agent-slate {
  background: color-mix(in srgb, rgba(97, 112, 124, 0.12) 76%, white);
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

.speaker-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.speaker-meta {
  display: inline-flex;
  align-items: center;
  padding: 0.24rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-bg-subtle) 84%, white);
  color: var(--color-text-muted);
  font-size: 0.74rem;
  font-weight: 700;
}

.message-topline span {
  color: var(--color-text-muted);
  font-size: 0.82rem;
}

.reasoning-block {
  margin-bottom: 12px;
  border: 1px dashed var(--color-border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--color-surface-strong) 88%, white);
}

.reasoning-block summary {
  cursor: pointer;
  list-style: none;
  padding: 12px 14px;
  color: var(--color-text);
  font-size: 0.84rem;
  font-weight: 700;
}

.reasoning-block summary::-webkit-details-marker {
  display: none;
}

.reasoning-block :deep(.markdown-body) {
  padding: 0 14px 14px;
}

.status-copy {
  margin: 0;
  line-height: 1.7;
}

.message-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.message-action {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.72rem 0.95rem;
  background: var(--color-surface-strong);
  color: var(--color-text);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.message-action:hover {
  border-color: color-mix(in srgb, var(--color-primary) 38%, var(--color-border));
  color: var(--color-primary);
}
</style>
