<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '../../stores/auth';
import { useWorkspaceStore } from '../../stores/workspace';
import { runtimeConfig } from '../../config/runtime';
import { createPraxisSsoClient } from '../../services/praxisSsoClient';

const props = withDefaults(defineProps<{
  layoutMode?: 'desktop' | 'mobile';
}>(), {
  layoutMode: 'desktop',
});

const emit = defineEmits<{
  requestCloseMobile: [];
}>();

const workspaceStore = useWorkspaceStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const { mobileSideRailOpen, threads, activeThreadId, sideRailCollapsed, threadCreateStatus, threadDeleteStatus } = storeToRefs(workspaceStore);
const openThreadMenuId = ref<string | null>(null);
const deletingThreadId = ref<string | null>(null);
const praxisSsoClient = createPraxisSsoClient();
const praxisLaunchStatus = ref<'idle' | 'loading' | 'error'>('idle');
const praxisLaunchError = ref<string | null>(null);

type IconName = 'profile' | 'artifacts' | 'settings' | 'praxis' | 'plus' | 'panelOpen' | 'panelClose' | 'more' | 'trash' | 'logout';

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
const showPraxisLaunch = computed(
  () => runtimeConfig.clientMode === 'upstream'
    && runtimeConfig.upstreamConfigured
    && !runtimeConfig.skipAuth,
);

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
    case 'praxis':
      return [
        'M14 5h5v5',
        'M10 14 19 5',
        'M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6',
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
    case 'more':
      return [
        'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
        'M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
        'M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
      ];
    case 'trash':
      return [
        'M3 6h18',
        'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
        'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
        'M10 11v6',
        'M14 11v6',
      ];
    case 'logout':
      return [
        'M10 17l5-5-5-5',
        'M15 12H3',
        'M21 3v18',
      ];
    default:
      return [];
  }
}

async function openConversationLanding() {
  openThreadMenuId.value = null;
  workspaceStore.closeArtifact();
  maybeCloseMobileRail();

  if (route.name !== 'home') {
    await router.push('/');
  }
}

function toggleThreadMenu(threadId: string) {
  openThreadMenuId.value = openThreadMenuId.value === threadId ? null : threadId;
}

function handleThreadNavigation() {
  openThreadMenuId.value = null;
  maybeCloseMobileRail();
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!openThreadMenuId.value || !(event.target instanceof Element)) {
    return;
  }

  if (event.target.closest('.thread-menu') || event.target.closest('.thread-menu-button')) {
    return;
  }

  openThreadMenuId.value = null;
}

async function deleteThread(threadId: string, title: string) {
  openThreadMenuId.value = null;

  if (!window.confirm(`删除对话「${title}」？此操作无法恢复。`)) {
    return;
  }

  deletingThreadId.value = threadId;

  try {
    const nextActiveThreadId = await workspaceStore.deleteThread(threadId);
    maybeCloseMobileRail();

    if (route.name === 'thread' && String(route.params.threadId) === threadId) {
      await router.replace(nextActiveThreadId ? `/threads/${nextActiveThreadId}` : '/');
    }
  } catch {
    // Store-level errorMessage owns the visible failure state.
  } finally {
    deletingThreadId.value = null;
  }
}

async function logout() {
  try {
    await authStore.logout();
  } finally {
    workspaceStore.resetWorkspace();
    maybeCloseMobileRail();
    await router.replace('/auth');
  }
}

async function launchPraxis() {
  if (praxisLaunchStatus.value === 'loading') return;
  praxisLaunchStatus.value = 'loading';
  praxisLaunchError.value = null;
  try {
    await praxisSsoClient.launch();
  } catch (error) {
    praxisLaunchStatus.value = 'error';
    praxisLaunchError.value = error instanceof Error
      ? error.message
      : '无法进入 Praxis。';
  }
}

watch(
  () => route.fullPath,
  () => {
    openThreadMenuId.value = null;
  },
);

onMounted(() => {
  window.addEventListener('pointerdown', handleDocumentPointerDown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleDocumentPointerDown, true);
});
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
            <span class="brand-mark" aria-hidden="true">
              <img src="/brand-icon.png" alt="" />
            </span>
            <span class="brand-toggle-icon" aria-hidden="true">
              <svg class="rail-icon" viewBox="0 0 24 24">
                <path v-for="path in getIconPaths('panelOpen')" :key="path" :d="path" />
              </svg>
            </span>
          </button>
        </template>
        <template v-else>
          <span class="brand-mark" aria-hidden="true">
            <img src="/brand-icon.png" alt="" />
          </span>
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
        <button
          v-if="showPraxisLaunch"
          type="button"
          class="nav-link praxis-link"
          title="进入 Praxis"
          aria-label="进入 Praxis"
          :disabled="praxisLaunchStatus === 'loading'"
          @click="launchPraxis"
        >
          <span class="nav-icon-shell" aria-hidden="true">
            <svg class="nav-icon" viewBox="0 0 24 24">
              <path v-for="path in getIconPaths('praxis')" :key="path" :d="path" />
            </svg>
          </span>
          <span class="nav-label">
            {{ praxisLaunchStatus === 'loading' ? '正在进入 Praxis…' : '进入 Praxis' }}
          </span>
        </button>
        <p v-if="praxisLaunchError && !effectiveCollapsed" class="praxis-error" role="alert">
          {{ praxisLaunchError }}
        </p>
      </nav>

      <section v-if="!effectiveCollapsed" class="thread-block">
        <div class="section-head">
          <span>最近</span>
          <span v-if="isThreadRoute && !effectiveCollapsed">当前</span>
        </div>

        <div class="thread-list">
          <div
            v-for="thread in threads"
            :key="thread.id"
            class="thread-row"
            :class="{ active: isThreadRoute && thread.id === activeThreadId, 'menu-open': openThreadMenuId === thread.id }"
          >
            <RouterLink
              class="thread-link"
              :class="{ active: isThreadRoute && thread.id === activeThreadId, compact: effectiveCollapsed }"
              :to="`/threads/${thread.id}`"
              :title="thread.title"
              :aria-label="thread.title"
              @click="handleThreadNavigation"
            >
              <strong>{{ thread.title }}</strong>
            </RouterLink>
            <button
              type="button"
              class="thread-menu-button"
              :class="{ active: openThreadMenuId === thread.id }"
              :aria-label="`打开${thread.title}操作菜单`"
              :aria-expanded="openThreadMenuId === thread.id"
              :aria-controls="`thread-menu-${thread.id}`"
              :disabled="threadDeleteStatus === 'loading' && deletingThreadId === thread.id"
              @click="toggleThreadMenu(thread.id)"
            >
              <svg class="rail-icon" aria-hidden="true" viewBox="0 0 24 24">
                <path v-for="path in getIconPaths('more')" :key="path" :d="path" />
              </svg>
            </button>
            <div v-if="openThreadMenuId === thread.id" :id="`thread-menu-${thread.id}`" class="thread-menu">
              <button type="button" @click="deleteThread(thread.id, thread.title)">
                <svg class="rail-icon" aria-hidden="true" viewBox="0 0 24 24">
                  <path v-for="path in getIconPaths('trash')" :key="path" :d="path" />
                </svg>
                <span>{{ deletingThreadId === thread.id ? '删除中...' : '删除对话' }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <button v-if="!effectiveCollapsed" type="button" class="logout-button" @click="logout">
      <svg class="rail-icon" aria-hidden="true" viewBox="0 0 24 24">
        <path v-for="path in getIconPaths('logout')" :key="path" :d="path" />
      </svg>
      <span>退出登录</span>
    </button>
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
    padding 280ms cubic-bezier(0.2, 0, 0, 1),
    background 280ms cubic-bezier(0.2, 0, 0, 1);
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
    transform 280ms cubic-bezier(0.2, 0, 0, 1),
    opacity 280ms cubic-bezier(0.2, 0, 0, 1),
    padding 280ms cubic-bezier(0.2, 0, 0, 1),
    background 280ms cubic-bezier(0.2, 0, 0, 1);
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
  gap: 9px;
  min-width: 0;
  min-height: 36px;
  overflow: hidden;
}

.brand-block.compact {
  display: flex;
  align-items: center;
  gap: 0;
  justify-content: center;
}

.brand-mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 32px;
  aspect-ratio: 1;
  border-radius: 9px;
  overflow: hidden;
}

.brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
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
    opacity 200ms cubic-bezier(0.2, 0, 0, 1),
    transform 200ms cubic-bezier(0.2, 0, 0, 1),
    border-color 200ms cubic-bezier(0.2, 0, 0, 1),
    background 200ms cubic-bezier(0.2, 0, 0, 1);
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
  font-size: 1.04rem;
  font-weight: 780;
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

.praxis-link {
  width: 100%;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.praxis-link:disabled {
  cursor: wait;
  opacity: 0.68;
}

.praxis-error {
  margin: 0 8px;
  color: var(--color-danger, #b42318);
  font-size: 12px;
  line-height: 1.4;
}

.nav-label {
  display: block;
  overflow: hidden;
  line-height: var(--rail-item-height);
  opacity: 1;
  text-overflow: ellipsis;
  transform: translateX(0);
  transition:
    opacity 200ms cubic-bezier(0.2, 0, 0, 1),
    transform 200ms cubic-bezier(0.2, 0, 0, 1);
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
    width 280ms cubic-bezier(0.2, 0, 0, 1),
    height 280ms cubic-bezier(0.2, 0, 0, 1),
    border-color 200ms cubic-bezier(0.2, 0, 0, 1),
    background 200ms cubic-bezier(0.2, 0, 0, 1),
    color 200ms cubic-bezier(0.2, 0, 0, 1);
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
  min-width: 0;
  flex: 1 1 auto;
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
    opacity 200ms cubic-bezier(0.2, 0, 0, 1),
    transform 200ms cubic-bezier(0.2, 0, 0, 1);
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

.thread-row {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 18px;
}

.thread-row.active,
.thread-row:hover,
.thread-row.menu-open {
  border-color: var(--color-border);
  background: color-mix(in srgb, var(--color-surface-strong) 76%, var(--color-bg));
}

.thread-row.active .thread-link,
.thread-row:hover .thread-link,
.thread-row.menu-open .thread-link {
  border-color: transparent;
  background: transparent;
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

.thread-menu-button {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  margin-right: 3px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.thread-row:hover .thread-menu-button,
.thread-row.active .thread-menu-button,
.thread-menu-button.active,
.thread-menu-button:focus-visible {
  opacity: 1;
}

.thread-menu-button:hover,
.thread-menu-button.active {
  background: color-mix(in srgb, var(--color-bg-subtle) 78%, white);
  color: var(--color-text);
}

.thread-menu-button:disabled {
  cursor: wait;
  opacity: 0.64;
}

.thread-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 4px;
  z-index: 10;
  width: 118px;
  padding: 5px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-strong);
  box-shadow: 0 12px 26px rgba(32, 36, 42, 0.14);
}

.thread-menu button {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-danger);
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 750;
  text-align: left;
}

.thread-menu button:hover {
  background: color-mix(in srgb, var(--color-warning-soft) 60%, white);
}

.logout-button {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 0 0 auto;
  min-height: 34px;
  margin-top: 12px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-weight: 750;
}

.logout-button:hover {
  background: color-mix(in srgb, var(--color-primary-soft) 58%, white);
  color: var(--color-text);
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
