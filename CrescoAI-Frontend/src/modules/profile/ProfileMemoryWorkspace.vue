<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { CreateProfileMemoryInput, ProfileMemoryRecord, ProfileStateRecord } from './profileV2Types';

const props = defineProps<{
  memories: ProfileMemoryRecord[];
  profileState: ProfileStateRecord | null;
}>();
const emit = defineEmits<{
  create: [input: CreateProfileMemoryInput];
  update: [id: string, patch: Partial<ProfileMemoryRecord>];
  delete: [id: string];
}>();
const draft = reactive<CreateProfileMemoryInput>({
  content: '',
  category: 'preference',
  timeScope: 'short_term',
  priority: 'normal',
  slotKey: '',
  appliesTo: [],
  expiresAt: null,
});

const active = computed(() => props.memories.filter((item) => item.status === 'active'));
const groups = computed(() => ({
  constraints: active.value.filter((item) => item.priority === 'hard_constraint'),
  shortTerm: active.value.filter((item) => item.timeScope === 'short_term' && item.priority !== 'hard_constraint'),
  longTerm: active.value.filter((item) => item.timeScope === 'long_term' && item.priority !== 'hard_constraint'),
  history: props.memories.filter((item) => item.status !== 'active'),
}));

function submit() {
  if (!draft.content.trim()) return;
  emit('create', {
    ...draft,
    content: draft.content.trim(),
    expiresAt: draft.expiresAt || null,
  });
  draft.content = '';
}

function edit(item: ProfileMemoryRecord) {
  const content = window.prompt('修改这条 Profile Memory', item.content)?.trim();
  if (content && content !== item.content) emit('update', item.id, { content });
}
</script>

<template>
  <section class="memory-workspace">
    <header>
      <div><p class="eyebrow">PROFILE MEMORY</p><h2>Agent 记忆</h2></div>
      <span v-if="profileState">聚合版本 {{ profileState.aggregateVersion }} · 文件 {{ profileState.projectionStatus }}</span>
    </header>

    <form class="memory-create" @submit.prevent="submit">
      <textarea v-model="draft.content" placeholder="要求 Agent 记住一项目标、偏好或约束"></textarea>
      <select v-model="draft.category"><option value="goal">目标</option><option value="preference">偏好</option><option value="constraint">约束</option><option value="compensation">待遇</option><option value="environment">环境</option><option value="communication">沟通方式</option><option value="background">背景</option></select>
      <select v-model="draft.timeScope"><option value="short_term">短期</option><option value="long_term">长期</option></select>
      <select v-model="draft.priority"><option value="normal">一般偏好</option><option value="high">高优先</option><option value="hard_constraint">强约束</option><option value="background">背景</option></select>
      <input v-if="draft.timeScope === 'short_term'" v-model="draft.expiresAt" type="date" title="可选到期时间" />
      <button>记住</button>
    </form>

    <section v-for="(items, key) in groups" :key="key" class="memory-group">
      <h3>{{ key === 'constraints' ? '强约束' : key === 'shortTerm' ? '短期 Profile' : key === 'longTerm' ? '长期 Profile' : '已失效或已替代' }}</h3>
      <p v-if="!items.length" class="empty">暂无</p>
      <article v-for="item in items" :key="item.id" class="memory-item">
        <p>{{ item.content }}</p>
        <small>{{ item.category }} · {{ item.priority }} · {{ item.sourceType }}<template v-if="item.expiresAt"> · 到期 {{ item.expiresAt.slice(0, 10) }}</template></small>
        <div v-if="item.status === 'active'" class="actions">
          <button @click="edit(item)">编辑</button>
          <button v-if="item.timeScope === 'short_term'" @click="emit('update', item.id, { timeScope: 'long_term' })">转为长期</button>
          <button @click="emit('update', item.id, { status: 'expired' })">标记不准确/失效</button>
          <button @click="emit('delete', item.id)">忘记</button>
        </div>
        <div v-else class="actions">
          <button @click="emit('update', item.id, { status: 'active' })">恢复为有效</button>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.memory-workspace { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-surface); }
header, .actions { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
h2, h3, p { margin: 0; }
.memory-create { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; gap: 8px; }
textarea, input, select, button { border: 1px solid var(--color-border); border-radius: 10px; padding: 9px 10px; background: var(--color-surface-strong); color: var(--color-text); }
.memory-group { display: grid; gap: 8px; }
.memory-item { display: grid; gap: 6px; padding: 12px; border-radius: 12px; background: var(--color-bg-subtle); }
small, .empty { color: var(--color-text-muted); }
.actions { justify-content: flex-end; }
@media (max-width: 800px) { .memory-create { grid-template-columns: 1fr; } }
</style>
