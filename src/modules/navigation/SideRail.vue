<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../../stores/workspace';

const workspaceStore = useWorkspaceStore();
const route = useRoute();
const { threads, activeThreadId, sideRailCollapsed } = storeToRefs(workspaceStore);

const navItems = computed(() => [
  { label: 'Threads', shortLabel: 'Th', to: `/threads/${activeThreadId.value ?? 'thread-001'}` },
  { label: 'Profile', shortLabel: 'Pr', to: '/profile' },
  { label: 'Artifacts', shortLabel: 'Ar', to: '/artifacts' },
  { label: 'Settings', shortLabel: 'St', to: '/settings' },
]);

const isThreadRoute = computed(() => route.name === 'thread');
const sideRailContentId = 'side-rail-content';

function toggleSideRail() {
  workspaceStore.toggleSideRailCollapsed();
}

function getThreadMonogram(title: string) {
  return title
    .split(/\s+/)
    .map((segment) => segment[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
</script>

<template>
  <aside class="side-rail" :class="{ collapsed: sideRailCollapsed }">
    <div class="rail-header">
      <div class="brand-block">
        <p class="eyebrow">Career Agent</p>
        <h1>{{ sideRailCollapsed ? 'CA' : 'Frontend' }}</h1>
        <p v-if="!sideRailCollapsed" class="support-copy">Workspace shell, typed adapters, and artifact host.</p>
      </div>
      <button
        type="button"
        class="collapse-button"
        :aria-label="sideRailCollapsed ? 'Expand left rail' : 'Collapse left rail'"
        :aria-expanded="!sideRailCollapsed"
        :aria-controls="sideRailContentId"
        @click="toggleSideRail"
      >
        {{ sideRailCollapsed ? '>' : '<' }}
      </button>
    </div>

    <div :id="sideRailContentId" class="side-rail-scroll">
      <nav class="nav-block">
        <RouterLink
          v-for="item in navItems"
          :key="item.label"
          class="nav-link"
          :to="item.to"
          :title="item.label"
          :aria-label="item.label"
        >
          <span class="nav-label" v-if="!sideRailCollapsed">{{ item.label }}</span>
          <span class="nav-short" v-else>{{ item.shortLabel }}</span>
        </RouterLink>
      </nav>

      <section class="thread-block">
        <div class="section-head">
          <span>{{ sideRailCollapsed ? 'Th' : 'Mock Threads' }}</span>
          <span v-if="isThreadRoute && !sideRailCollapsed">active</span>
        </div>

        <div class="thread-list">
          <RouterLink
            v-for="thread in threads"
            :key="thread.id"
            class="thread-link"
            :class="{ active: thread.id === activeThreadId, compact: sideRailCollapsed }"
            :to="`/threads/${thread.id}`"
            :title="thread.title"
            :aria-label="thread.title"
          >
            <strong>{{ sideRailCollapsed ? getThreadMonogram(thread.title) : thread.title }}</strong>
            <span v-if="!sideRailCollapsed">{{ thread.preview }}</span>
          </RouterLink>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.side-rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100vh;
  padding: 20px 18px;
  border-right: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 92%, white);
  overflow: hidden;
}

.rail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.side-rail-scroll {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 24px;
  min-height: 0;
  flex: 1;
  overflow: hidden;
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

.thread-block {
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
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

.nav-label,
.nav-short {
  display: block;
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

.thread-list {
  display: grid;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
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

.collapse-button {
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  padding: 0.62rem 0.78rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.side-rail.collapsed {
  padding-inline: 14px;
}

.side-rail.collapsed .rail-header {
  flex-direction: column;
  align-items: center;
}

.side-rail.collapsed .brand-block,
.side-rail.collapsed .section-head {
  text-align: center;
}

.side-rail.collapsed .nav-link,
.side-rail.collapsed .thread-link.compact {
  padding-inline: 0.72rem;
  text-align: center;
}

.side-rail.collapsed .thread-link.compact strong {
  font-size: 0.82rem;
  letter-spacing: 0.08em;
}

@media (max-width: 960px) {
  .side-rail {
    height: auto;
    min-height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .side-rail-scroll {
    overflow: visible;
  }

  .thread-list {
    overflow: visible;
    padding-right: 0;
  }

  .side-rail.collapsed .rail-header {
    flex-direction: row;
    align-items: flex-start;
  }

  .side-rail.collapsed .brand-block,
  .side-rail.collapsed .section-head,
  .side-rail.collapsed .nav-link,
  .side-rail.collapsed .thread-link.compact {
    text-align: left;
  }
}
</style>
