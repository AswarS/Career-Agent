<script setup lang="ts">
import type { ProfileChangeProposalRecord } from './profileV2Types';

defineProps<{ proposals: ProfileChangeProposalRecord[] }>();
const emit = defineEmits<{ resolve: [id: string, action: 'accept' | 'reject'] }>();

function candidateText(proposal: ProfileChangeProposalRecord) {
  const content = proposal.candidate.content;
  return typeof content === 'string'
    ? content
    : JSON.stringify(proposal.candidate, null, 2);
}

function profileIndex(proposal: ProfileChangeProposalRecord) {
  const value = proposal.candidate.profileIndex ?? proposal.currentValue?.profileIndex;
  return typeof value === 'string' ? value : '';
}

function profileLevel(proposal: ProfileChangeProposalRecord) {
  const value = proposal.candidate.level ?? proposal.candidate.profileLevel;
  return typeof value === 'string' ? value : '';
}
</script>

<template>
  <section class="proposal-panel">
    <header><div><p class="eyebrow">REVIEW</p><h2>待确认更新</h2></div><span>{{ proposals.length }} 条</span></header>
    <p v-if="!proposals.length" class="empty">暂无待确认更新。</p>
    <article v-for="proposal in proposals" :key="proposal.id">
      <div class="proposal-title">
        <strong>{{ proposal.targetType === 'base_profile' ? '基础资料变更' : 'Profile Memory' }}</strong>
        <span><template v-if="profileIndex(proposal)">[{{ profileIndex(proposal) }}] · </template><template v-if="profileLevel(proposal)">{{ profileLevel(proposal) }} 内容 · </template>{{ proposal.updateLevel }} 更新 · {{ proposal.operation }}</span>
      </div>
      <p>{{ candidateText(proposal) }}</p>
      <details v-if="proposal.currentValue"><summary>查看当前信息</summary><pre>{{ JSON.stringify(proposal.currentValue, null, 2) }}</pre></details>
      <small>{{ proposal.rationale }}</small>
      <p v-if="proposal.conflictIds.length" class="conflict">将替代 {{ proposal.conflictIds.length }} 条现有信息</p>
      <div class="actions">
        <button @click="emit('resolve', proposal.id, 'reject')">拒绝</button>
        <button class="accept" @click="emit('resolve', proposal.id, 'accept')">确认更新</button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.proposal-panel { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-surface); }
header, .proposal-title, .actions { display: flex; justify-content: space-between; gap: 10px; }
h2, p { margin: 0; }
article { display: grid; gap: 8px; padding: 12px; border-radius: 12px; background: var(--color-primary-soft); }
small, .empty { color: var(--color-text-muted); }
.conflict { color: var(--color-warning); }
.actions { justify-content: flex-end; }
button { padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 999px; background: var(--color-surface); }
.accept { background: var(--color-primary); color: var(--color-on-primary); }
</style>
