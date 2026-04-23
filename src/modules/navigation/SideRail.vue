<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../../stores/workspace';

const props = withDefaults(defineProps<{
  layoutMode?: 'desktop' | 'mobile';
}>(), {
  layoutMode: 'desktop',
});

const emit = defineEmits<{
  requestCloseMobile: [];
}>();

const workspaceStore = useWorkspaceStore();
const route = useRoute();
const router = useRouter();
const { mobileSideRailOpen, threads, activeThreadId, sideRailCollapsed, threadCreateStatus } = storeToRefs(workspaceStore);

type IconName = 'profile' | 'artifacts' | 'settings' | 'plus' | 'panelOpen' | 'panelClose';

const navItems = computed(() => [
  { label: '画像', icon: 'profile' as const, to: '/profile' },
  { label: '工件', icon: 'artifacts' as const, to: '/artifacts' },
  { label: '设置', icon: 'settings' as const, to: '/settings' },
]);

const isThreadRoute = computed(() => route.name === 'thread');
const sideRailContentId = 'side-rail-content';
const isMobileLayout = computed(() => props.layoutMode === 'mobile');
const isVisible = computed(() => !isMobileLayout.value || mobileSideRailOpen.value);
const effectiveCollapsed = computed(() => isMobileLayout.value ? false : sideRailCollapsed.value);

function toggleSideRail() {
  if (isMobileLayout.value) {
    emit('requestCloseMobile');
    return;
  }

  workspaceStore.toggleSideRailCollapsed();
}

function maybeCloseMobileRail() {
  if (isMobileLayout.value) {
    emit('requestCloseMobile');
  }
}

function getIconPaths(icon: IconName) {
  switch (icon) {
    case 'profile':
      return [
        'M18 20a6 6 0 0 0-12 0',
        'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
      ];
    case 'artifacts':
      return [
        'M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2',
        'M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
        'M4 12h16',
        'M10 12v2h4v-2',
      ];
    case 'settings':
      return [
        'M4 7h10',
        'M18 7h2',
        'M4 12h2',
        'M10 12h10',
        'M4 17h10',
        'M18 17h2',
        'M14 5v4',
        'M8 10v4',
        'M14 15v4',
      ];
    case 'plus':
      return [
        'M12 5v14',
        'M5 12h14',
      ];
    case 'panelOpen':
      return [
        'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
        'M9 3v18',
        'M14 9l3 3-3 3',
      ];
    case 'panelClose':
      return [
        'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
        'M9 3v18',
        'M16 9l-3 3 3 3',
      ];
    default:
      return [];
  }
}

async function openConversationLanding() {
  workspaceStore.closeArtifact();
  maybeCloseMobileRail();

  if (route.name !== 'home') {
    await router.push('/');
  }
}
</script>

<template>
  <aside class="side-rail" :class="{ collapsed: effectiveCollapsed, 'mobile-layout': isMobileLayout, visible: isVisible }">
    <div class="rail-header">
      <div class="brand-block" :class="{ compact: effectiveCollapsed }">
        <template v-if="effectiveCollapsed">
          <button
            type="button"
            class="brand-toggle"
            :aria-label="'展开左侧导航'"
            :aria-expanded="!effectiveCollapsed"
            :aria-controls="sideRailContentId"
            @click="toggleSideRail"
          >
            <span class="brand-mark" aria-hidden="true">CA</span>
            <span class="brand-toggle-icon" aria-hidden="true">
              <svg class="rail-icon" viewBox="0 0 24 24">
                <path v-for="path in getIconPaths('panelOpen')" :key="path" :d="path" />
              </svg>
            </span>
          </button>
        </template>
        <template v-else>
          <h1>CrescoAI</h1>
        </template>
      </div>
      <button
        v-if="!effectiveCollapsed"
        type="button"
        class="collapse-button"
        :aria-label="isMobileLayout ? '关闭左侧导航' : '收起左侧导航'"
        :aria-expanded="isMobileLayout ? isVisible : !effectiveCollapsed"
        :aria-controls="sideRailContentId"
        @click="toggleSideRail"
      >
        <svg class="rail-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path
            v-for="path in getIconPaths('panelClose')"
            :key="path"
            :d="path"
          />
        </svg>
      </button>
    </div>

    <button
      type="button"
      class="new-thread-button rail-primary-action"
      :class="{ compact: effectiveCollapsed }"
      :disabled="threadCreateStatus === 'loading'"
      :aria-label="effectiveCollapsed ? '新建对话' : undefined"
      @click="openConversationLanding"
    >
      <span aria-hidden="true">
        <svg class="rail-icon" viewBox="0 0 24 24">
          <path v-for="path in getIconPaths('plus')" :key="path" :d="path" />
        </svg>
      </span>
      <strong>{{ threadCreateStatus === 'loading' ? '创建中...' : '新建对话' }}</strong>
    </button>

    <div :id="sideRailContentId" class="side-rail-scroll">
      <nav class="nav-block">
        <RouterLink
          v-for="item in navItems"
          :key="item.label"
          class="nav-link"
          :to="item.to"
          :title="item.label"
          :aria-label="item.label"
          @click="maybeCloseMobileRail"
        >
          <span class="nav-icon-shell" aria-hidden="true">
            <svg class="nav-icon" viewBox="0 0 24 24">
              <path v-for="path in getIconPaths(item.icon)" :key="path" :d="path" />
            </svg>
          </span>
          <span class="nav-label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <section v-if="!effectiveCollapsed" class="thread-block">
        <div class="section-head">
          <span>最近</span>
          <span v-if="isThreadRoute && !effectiveCollapsed">当前</span>
        </div>

        <div class="thread-list">
          <RouterLink
            v-for="thread in threads"
            :key="thread.id"
            class="thread-link"
            :class="{ active: isThreadRoute && thread.id === activeThreadId, compact: effectiveCollapsed }"
            :to="`/threads/${thread.id}`"
            :title="thread.title"
            :aria-label="thread.title"
            @click="maybeCloseMobileRail"
          >
            <strong>{{ thread.title }}</strong>
          </RouterLink>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.side-rail {
  --rail-item-height: 34px;
  --rail-item-gap: 6px;
  --rail-icon-size: 32px;
  --rail-icon-box-size: 30px;
  --rail-icon-left: 6px;
  --rail-padding-left: 14px;
  --rail-padding-right: 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100vh;
  padding: 18px var(--rail-padding-right) 18px var(--rail-padding-left);
  border-right: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 70%, var(--color-bg));
  overflow: hidden;
  transition:
    padding 180ms ease,
    background 180ms ease;
}

.side-rail.mobile-layout {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: var(--side-rail-expanded-width, 244px);
  z-index: 40;
  box-shadow: 18px 0 36px rgba(32, 36, 42, 0.18);
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
  transition:
    transform 180ms ease,
    opacity 180ms ease,
    padding 180ms ease,
    background 180ms ease;
}

.side-rail.mobile-layout.visible {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}

.rail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
}

.side-rail-scroll {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.brand-block {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 38px;
  overflow: hidden;
}

.brand-block.compact {
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.brand-toggle {
  position: relative;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.brand-toggle .brand-mark,
.brand-toggle-icon {
  grid-area: 1 / 1;
  transition:
    opacity 140ms ease,
    transform 140ms ease,
    border-color 140ms ease,
    background 140ms ease;
}

.brand-toggle-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  opacity: 0;
  transform: scale(0.96);
}

.brand-toggle:hover .brand-mark,
.brand-toggle:focus-visible .brand-mark {
  opacity: 0;
  transform: scale(0.96);
}

.brand-toggle:hover .brand-toggle-icon,
.brand-toggle:focus-visible .brand-toggle-icon {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-surface-strong) 72%, var(--color-bg-subtle));
  opacity: 1;
  transform: scale(1);
}

.brand-block h1 {
  margin: 0;
  overflow: hidden;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-head {
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nav-block,
.thread-block {
  display: grid;
  gap: var(--rail-item-gap);
}

.thread-block {
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}

.nav-link,
.thread-link {
  display: flex;
  align-items: center;
  border-radius: 18px;
  text-decoration: none;
  transition: background 160ms ease;
}

.nav-link {
  display: grid;
  grid-template-columns: var(--rail-icon-size) minmax(0, 1fr);
  align-items: center;
  min-height: var(--rail-item-height);
  padding: 0 0.72rem 0 var(--rail-icon-left);
  column-gap: 8px;
  color: var(--color-text);
  background: transparent;
  white-space: nowrap;
}

.nav-label {
  display: block;
  overflow: hidden;
  line-height: var(--rail-item-height);
  opacity: 1;
  text-overflow: ellipsis;
  transform: translateX(0);
  transition:
    opacity 140ms ease,
    transform 140ms ease;
  white-space: nowrap;
}

.nav-icon-shell {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: var(--rail-icon-box-size);
  height: var(--rail-icon-box-size);
  border-radius: 9px;
  color: inherit;
  transition:
    width 180ms ease,
    height 180ms ease,
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.nav-link.router-link-active {
  background: color-mix(in srgb, var(--color-primary-soft) 70%, white);
  color: var(--color-primary);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.thread-link {
  min-height: 34px;
  padding: 0 0.72rem;
  background: transparent;
  border: 1px solid transparent;
}

.new-thread-button {
  display: grid;
  grid-template-columns: var(--rail-icon-size) minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  width: 100%;
  border: 0;
  border-radius: 18px;
  min-height: var(--rail-item-height);
  padding: 0 0.72rem 0 var(--rail-icon-left);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.rail-icon,
.nav-icon {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-icon {
  width: 18px;
  height: 18px;
}

.rail-primary-action {
  flex: 0 0 auto;
  margin: 14px 0 var(--rail-item-gap);
  box-shadow: none;
}

.rail-primary-action:hover {
  background: color-mix(in srgb, var(--color-primary-soft) 70%, white);
  color: var(--color-primary);
}

.new-thread-button span {
  display: grid;
  place-items: center;
  width: var(--rail-icon-box-size);
  height: var(--rail-icon-box-size);
  border: 1px solid transparent;
  border-radius: 9px;
  background: var(--color-text);
  color: var(--color-on-primary);
  font-weight: 900;
}

.new-thread-button strong {
  overflow: hidden;
  color: inherit;
  font-size: 0.86rem;
  font-weight: 700;
  opacity: 1;
  text-overflow: ellipsis;
  transform: translateX(0);
  transition:
    opacity 140ms ease,
    transform 140ms ease;
  white-space: nowrap;
}

.new-thread-button:hover {
  background: color-mix(in srgb, var(--color-primary-soft) 70%, white);
}

.new-thread-button:disabled {
  cursor: wait;
  opacity: 0.68;
}

.thread-list {
  display: grid;
  gap: 6px;
  min-height: 0;
  align-content: start;
  overflow-y: auto;
  margin-right: calc(var(--rail-padding-right) * -1);
  padding-right: var(--rail-padding-right);
  scrollbar-gutter: stable;
}

.thread-link.active,
.thread-link:hover {
  border-color: var(--color-border);
  background: color-mix(in srgb, var(--color-surface-strong) 76%, var(--color-bg));
}

.thread-link strong {
  display: block;
}

.thread-link strong {
  overflow: hidden;
  color: var(--color-text);
  font-size: 0.86rem;
  font-weight: 700;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collapse-button {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-strong);
  color: var(--color-text-muted);
  width: 34px;
  height: 34px;
  padding: 0;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background 160ms ease;
}

.collapse-button:hover {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-surface-strong) 70%, var(--color-bg-subtle));
  color: var(--color-text);
}

.side-rail.collapsed {
  --rail-item-height: 32px;
  --rail-item-gap: 7px;
  --rail-icon-left: 6px;
  --rail-padding-left: 8px;
  --rail-padding-right: 8px;
  padding-inline: 8px;
}

.side-rail.collapsed .rail-header {
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: auto;
}

.side-rail.collapsed .rail-primary-action {
  margin: 10px 0 var(--rail-item-gap);
}

.side-rail.collapsed .side-rail-scroll {
  gap: var(--rail-item-gap);
}

.side-rail.collapsed .nav-block {
  justify-items: center;
}

.side-rail.collapsed .nav-link,
.side-rail.collapsed .new-thread-button.compact {
  display: grid;
  place-items: center;
  width: 100%;
  border: 0;
  padding: 0 0 0 var(--rail-icon-left);
  background: transparent;
  box-shadow: none;
}

.side-rail.collapsed .new-thread-button.compact {
  width: 100%;
  height: 32px;
  grid-template-columns: var(--rail-icon-size);
  justify-content: start;
}

.side-rail.collapsed .new-thread-button span {
  display: grid;
  place-items: center;
  width: var(--rail-icon-box-size);
  height: var(--rail-icon-box-size);
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--color-text);
}

.side-rail.collapsed .nav-icon-shell {
  display: grid;
  place-items: center;
  width: var(--rail-icon-box-size);
  height: var(--rail-icon-box-size);
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--color-text);
}

.side-rail.collapsed .nav-label {
  width: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateX(-4px);
}

.side-rail.collapsed .new-thread-button strong {
  width: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateX(-4px);
}

.side-rail.collapsed .nav-icon {
  width: 18px;
  height: 18px;
  stroke-width: 1.45;
}

.side-rail.collapsed .new-thread-button span {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-on-primary);
}

.side-rail.collapsed .nav-link.router-link-active {
  background: transparent;
  color: inherit;
}

.side-rail.collapsed .nav-link.router-link-active .nav-icon-shell {
  border-color: color-mix(in srgb, var(--color-primary) 18%, transparent);
  background: color-mix(in srgb, var(--color-primary-soft) 54%, var(--color-surface));
  color: var(--color-primary);
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
  .side-rail.collapsed .new-thread-button.compact {
    text-align: left;
  }
}
</style>
