<script setup lang="ts">
import { computed } from 'vue';
import type {
  ProfileProductField,
  ProfileProductListField,
  ProfileRelatedConversation,
} from './profileProductTypes';

const props = defineProps<{
  field: ProfileProductField | ProfileProductListField;
  label?: string;
}>();
const emit = defineEmits<{
  open: [evidenceRef: string];
}>();

const entries = computed(() => {
  const list = props.field as ProfileProductListField;
  if (Array.isArray(list.value) && list.items?.length) {
    return list.items
      .filter((item) => item.relatedConversation)
      .map((item) => ({
        key: item.itemKey,
        label: item.value,
        relation: item.relatedConversation as ProfileRelatedConversation,
      }));
  }
  return props.field.relatedConversation
    ? [{ key: props.field.fieldKey, label: props.label ?? '', relation: props.field.relatedConversation }]
    : [];
});
</script>

<template>
  <div v-if="entries.length" class="related-conversations">
    <button
      v-for="entry in entries"
      :key="entry.key"
      type="button"
      class="related-conversation-button"
      @click="emit('open', entry.relation.ref)"
    >
      <span v-if="entry.label" class="related-value">{{ entry.label }}</span>
      <span>相关对话{{ entry.relation.count > 1 ? `（${entry.relation.count}）` : '' }}</span>
    </button>
  </div>
</template>

<style scoped>
.related-conversations { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 7px; }
.related-conversation-button { display: inline-flex; max-width: 100%; gap: 6px; align-items: center; border: 0; padding: 5px 8px; border-radius: 9px; color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, transparent); cursor: pointer; font: inherit; font-size: .78rem; font-weight: 700; }
.related-conversation-button:hover { background: color-mix(in srgb, var(--color-primary) 14%, transparent); }
.related-value { max-width: 14rem; overflow: hidden; color: var(--color-text-muted); text-overflow: ellipsis; white-space: nowrap; }
</style>
