<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../../stores/workspace';

const workspaceStore = useWorkspaceStore();
const route = useRoute();
const { threads, activeThreadId } = storeToRefs(workspaceStore);

const navItems = computed(() => [
  { label: 'Threads', to: `/threads/${activeThreadId.value ?? 'thread-001'}` },
  { label: 'Profile', to: '/profile' },
  { label: 'Artifacts', to: '/artifacts' },
  { label: 'Settings', to: '/settings' },
]);

const isThreadRoute = computed(() => route.name === 'thread');
</script>

<template>
  <aside class="side-rail">
    <div class="brand-block">
      <p class="eyebrow">Career Agent</p>
      <h1>Frontend</h1>
      <p class="support-copy">Workspace shell, typed adapters, and artifact host.</p>
    </div>

    <nav class="nav-block">
      <RouterLink
        v-for="item in navItems"
        :key="item.label"
        class="nav-link"
        :to="item.to"
      >
        {{ item.label }}
      </RouterLink>
    </nav>

    <section class="thread-block">
      <div class="section-head">
        <span>Mock Threads</span>
        <span v-if="isThreadRoute">active</span>
      </div>

      <RouterLink
        v-for="thread in threads"
        :key="thread.id"
        class="thread-link"
        :class="{ active: thread.id === activeThreadId }"
        :to="`/threads/${thread.id}`"
      >
        <strong>{{ thread.title }}</strong>
        <span>{{ thread.preview }}</span>
      </RouterLink>
    </section>
  </aside>
</template>

<style scoped>
.side-rail {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 100vh;
  padding: 20px 18px;
  border-right: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 92%, white);
}

.brand-block h1 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 2rem;
}

.eyebrow,
.section-head {
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.eyebrow {
  margin: 0 0 8px;
}

.support-copy {
  margin: 12px 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.nav-block,
.thread-block {
  display: grid;
  gap: 10px;
}

.nav-link,
.thread-link {
  display: block;
  border-radius: 18px;
  text-decoration: none;
  transition: background 160ms ease;
}

.nav-link {
  padding: 0.85rem 0.95rem;
  color: var(--color-text);
  background: transparent;
}

.nav-link.router-link-active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.thread-link {
  padding: 0.95rem;
  background: var(--color-bg-subtle);
  border: 1px solid transparent;
}

.thread-link.active,
.thread-link:hover {
  border-color: var(--color-border);
  background: var(--color-surface-strong);
}

.thread-link strong,
.thread-link span {
  display: block;
}

.thread-link strong {
  color: var(--color-text);
  font-size: 0.94rem;
}

.thread-link span {
  margin-top: 6px;
  color: var(--color-text-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}

@media (max-width: 960px) {
  .side-rail {
    min-height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }
}
</style>
