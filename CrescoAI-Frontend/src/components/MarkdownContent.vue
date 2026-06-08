<script setup lang="ts">
import { computed } from 'vue';
import { markdownRenderer } from './markdownRenderer';

const props = defineProps<{
  source: string;
}>();

const renderedHtml = computed(() => markdownRenderer.render(props.source));
</script>

<template>
  <div class="markdown-body" v-html="renderedHtml"></div>
</template>

<style scoped>
.markdown-body {
  color: inherit;
  line-height: 1.55;
}

.markdown-body :deep(p) {
  margin: 0;
}

.markdown-body :deep(p + p) {
  margin-top: 0.62rem;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.62rem 0 0;
  padding-left: 1.25rem;
}

.markdown-body :deep(li + li) {
  margin-top: 0.25rem;
}

.markdown-body :deep(code) {
  padding: 0.12rem 0.35rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-bg-subtle) 82%, white);
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.92em;
}

.markdown-body :deep(pre) {
  margin: 0.75rem 0 0;
  overflow: auto;
  padding: 0.75rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-surface-strong) 88%, white);
  border: 1px solid var(--color-border);
}

.markdown-body :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-body :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
}
</style>
