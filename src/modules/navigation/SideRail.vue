<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../../stores/workspace';

const workspaceStore = useWorkspaceStore();
const route = useRoute();
const { threads, activeThreadId, sideRailCollapsed } = storeToRefs(workspaceStore);

const navItems = computed(() => [
  { label: 'Threads', compactLabel: 'T', to: `/threads/${activeThreadId.value ?? 'thread-001'}` },
  { label: 'Profile', compactLabel: 'P', to: '/profile' },
  { label: 'Artifacts', compactLabel: 'A', to: '/artifacts' },
  { label: 'Settings', compactLabel: 'S', to: '/settings' },
]);

const isThreadRoute = computed(() => route.name === 'thread');
const sideRailContentId = 'side-rail-content';

function toggleSideRail() {
  workspaceStore.toggleSideRailCollapsed();
}

function getThreadGlyph(title: string) {
  return title.trim().charAt(0).toUpperCase();
}
</script>

<template>
  <aside class="side-rail" :class="{ collapsed: sideRailCollapsed }">
    <div class="rail-header">
      <div class="brand-block" :class="{ compact: sideRailCollapsed }">
        <template v-if="sideRailCollapsed">
          <div class="brand-mark" aria-hidden="true">CA</div>
        </template>
        <template v-else>
          <p class="eyebrow">Career Agent</p>
          <h1>Frontend</h1>
          <p class="support-copy">Workspace shell, typed adapters, and artifact host.</p>
        </template>
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
          <span class="nav-glyph" v-else>{{ item.compactLabel }}</span>
        </RouterLink>
      </nav>

      <section class="thread-block">
        <div v-if="!sideRailCollapsed" class="section-head">
          <span>{{ sideRailCollapsed ? 'Th' : 'Mock Threads' }}</span>
          <span v-if="isThreadRoute && !sideRailCollapsed">active</span>
        </div>
        <div v-else class="section-divider" aria-hidden="true"></div>

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
            <strong v-if="!sideRailCollapsed">{{ thread.title }}</strong>
            <span v-else class="thread-glyph">{{ getThreadGlyph(thread.title) }}</span>
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
  gap: 22px;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.brand-block {
  min-width: 0;
}

.brand-block.compact {
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-primary-soft) 42%, white);
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
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
.nav-glyph {
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
  align-content: start;
  overflow-y: auto;
  padding-right: 4px;
}

.thread-link.active,
.thread-link:hover {
  border-color: var(--color-border);
  background: var(--color-surface-strong);
}

.thread-link strong,
.thread-link span,
.thread-glyph {
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
  padding-inline: 12px;
}

.side-rail.collapsed .rail-header {
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.side-rail.collapsed .side-rail-scroll {
  gap: 18px;
}

.side-rail.collapsed .nav-block,
.side-rail.collapsed .thread-list {
  justify-items: center;
}

.side-rail.collapsed .nav-link,
.side-rail.collapsed .thread-link.compact {
  display: grid;
  place-items: center;
  width: 100%;
  padding: 0;
  background: transparent;
}

.side-rail.collapsed .nav-glyph,
.side-rail.collapsed .thread-glyph {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--color-bg-subtle);
  color: var(--color-text);
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.side-rail.collapsed .nav-link.router-link-active {
  background: transparent;
  color: inherit;
}

.side-rail.collapsed .nav-link.router-link-active .nav-glyph {
  border-color: transparent;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.section-divider {
  width: 24px;
  height: 1px;
  margin: 2px auto 0;
  background: var(--color-border);
}

.side-rail.collapsed .thread-list {
  gap: 12px;
  padding-right: 0;
}

.side-rail.collapsed .thread-link.compact {
  border: 0;
}

.side-rail.collapsed .thread-link.compact .thread-glyph {
  background: color-mix(in srgb, var(--color-bg-subtle) 74%, white);
}

.side-rail.collapsed .thread-link.compact.active,
.side-rail.collapsed .thread-link.compact:hover {
  background: transparent;
  border-color: transparent;
}

.side-rail.collapsed .thread-link.compact.active .thread-glyph,
.side-rail.collapsed .thread-link.compact:hover .thread-glyph {
  border-color: var(--color-border);
  background: var(--color-surface-strong);
}

.side-rail.collapsed .thread-block {
  gap: 14px;
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
