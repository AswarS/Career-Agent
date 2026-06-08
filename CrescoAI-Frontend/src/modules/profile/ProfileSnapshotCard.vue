<script setup lang="ts">
defineProps<{
  title: string;
  items: Array<{
    label: string;
    value: string | string[];
  }>;
}>();
</script>

<template>
  <article class="snapshot-card">
    <p class="eyebrow">{{ title }}</p>

    <div class="item-list">
      <section v-for="item in items" :key="item.label" class="snapshot-item">
        <h2>{{ item.label }}</h2>

        <template v-if="Array.isArray(item.value)">
          <ul v-if="item.value.length > 0" class="pill-list">
            <li v-for="entry in item.value" :key="entry">{{ entry }}</li>
          </ul>
          <p v-else class="empty-copy">暂未填写明确内容。</p>
        </template>

        <p v-else class="value-copy">{{ item.value }}</p>
      </section>
    </div>
  </article>
</template>

<style scoped>
.snapshot-card {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.item-list {
  display: grid;
  gap: 12px;
}

.snapshot-item h2 {
  margin: 0 0 6px;
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
