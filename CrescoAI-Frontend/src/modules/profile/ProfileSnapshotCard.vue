<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  title: string;
  eyebrow: string;
  description: string;
  writePolicyLabel: string;
  writePolicyKind: 'user' | 'agent' | 'conditional' | 'sensitive';
  items: Array<{
    label: string;
    value: string | string[];
    writePolicy: 'user_only' | 'agent_suggested' | 'agent_derived' | 'sensitive_user_confirmed';
  }>;
}>();

const visibleItems = computed(() => props.items.filter((item) => (
  Array.isArray(item.value) ? item.value.length > 0 : item.value.trim().length > 0
)));

const emptyCount = computed(() => props.items.length - visibleItems.value.length);
</script>

<template>
  <article class="snapshot-card">
    <header class="snapshot-head">
      <div>
        <p class="eyebrow">{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
        <p class="description-copy">{{ description }}</p>
      </div>
      <span v-if="emptyCount > 0" class="empty-count">{{ emptyCount }} 项待补</span>
      <span class="policy-chip" :class="writePolicyKind">{{ writePolicyLabel }}</span>
    </header>

    <div v-if="visibleItems.length > 0" class="item-list">
      <section v-for="item in visibleItems" :key="item.label" class="snapshot-item">
        <h2>{{ item.label }}</h2>

        <template v-if="Array.isArray(item.value)">
          <ul class="pill-list">
            <li v-for="entry in item.value" :key="entry">{{ entry }}</li>
          </ul>
        </template>

        <p v-else class="value-copy">{{ item.value }}</p>
      </section>
    </div>

    <p v-else class="empty-copy">暂无已填写内容</p>
  </article>
</template>

<style scoped>
.snapshot-card {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.snapshot-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.snapshot-head h1 {
  margin: 2px 0 3px;
  color: var(--color-text);
  font-size: 1rem;
  line-height: 1.25;
}

.eyebrow {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.description-copy {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  line-height: 1.4;
}

.empty-count {
  flex: 0 0 auto;
  padding: 0.18rem 0.44rem;
  border-radius: 999px;
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  font-size: 0.68rem;
  font-weight: 700;
}

.policy-chip {
  flex: 0 0 auto;
  padding: 0.18rem 0.44rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
}

.policy-chip.user {
  background: color-mix(in srgb, var(--color-accent) 12%, white);
  color: var(--color-accent);
}

.policy-chip.agent {
  background: color-mix(in srgb, #2563eb 12%, white);
  color: #2563eb;
}

.policy-chip.conditional {
  background: color-mix(in srgb, #a16207 14%, white);
  color: #a16207;
}

.policy-chip.sensitive {
  background: color-mix(in srgb, #b42318 12%, white);
  color: #b42318;
}

.item-list {
  display: grid;
  gap: 10px;
}

.snapshot-item h2 {
  margin: 0 0 5px;
  color: var(--color-text);
  font-size: 0.82rem;
}

.value-copy,
.empty-copy {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.45;
}

.pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pill-list li {
  padding: 0.28rem 0.5rem;
  border-radius: 999px;
  background: var(--color-bg-subtle);
  color: var(--color-text);
  font-size: 0.78rem;
  line-height: 1.3;
}
</style>
