<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterView, useRoute } from 'vue-router';
import ArtifactHost from '../modules/artifacts/ArtifactHost.vue';
import SideRail from '../modules/navigation/SideRail.vue';
import { MOBILE_LAYOUT_QUERY, matchesMobileLayoutViewport } from './responsive';
import { useWorkspaceStore } from '../stores/workspace';

const workspaceStore = useWorkspaceStore();
const route = useRoute();
const { artifactFocusMode, artifactImmersiveMode, artifactPaneOpen, mobileSideRailOpen, sideRailCollapsed } = storeToRefs(workspaceStore);
const isMobileLayout = ref(matchesMobileLayoutViewport());
const layoutSwitching = ref(false);
let mediaQueryList: MediaQueryList | null = null;
let layoutSwitchTimer: ReturnType<typeof window.setTimeout> | null = null;

function scheduleLayoutSwitchUnlock() {
  if (layoutSwitchTimer !== null) {
    window.clearTimeout(layoutSwitchTimer);
  }

  layoutSwitching.value = true;
  layoutSwitchTimer = window.setTimeout(() => {
    layoutSwitching.value = false;
    layoutSwitchTimer = null;
  }, 220);
}

function handleMobileLayoutChange(event: MediaQueryListEvent) {
  scheduleLayoutSwitchUnlock();
  isMobileLayout.value = event.matches;
  workspaceStore.syncArtifactViewForLayout(event.matches);

  if (!event.matches) {
    workspaceStore.closeMobileSideRail();
  }
}

const shellClasses = computed(() => ({
  'artifact-open': artifactPaneOpen.value,
  'artifact-focus': artifactFocusMode.value,
  'artifact-immersive': artifactImmersiveMode.value,
  'layout-switching': layoutSwitching.value,
  'mobile-layout': isMobileLayout.value,
  'side-rail-collapsed': sideRailCollapsed.value,
}));

onMounted(() => {
  void workspaceStore.initialize();
  mediaQueryList = window.matchMedia(MOBILE_LAYOUT_QUERY);
  isMobileLayout.value = mediaQueryList.matches;
  workspaceStore.syncArtifactViewForLayout(mediaQueryList.matches);
  mediaQueryList.addEventListener('change', handleMobileLayoutChange);
});

onBeforeUnmount(() => {
  mediaQueryList?.removeEventListener('change', handleMobileLayoutChange);

  if (layoutSwitchTimer !== null) {
    window.clearTimeout(layoutSwitchTimer);
  }
});

watch(
  () => route.fullPath,
  () => {
    workspaceStore.closeMobileSideRail();
  },
);
</script>

<template>
  <div class="app-shell" :class="shellClasses">
    <div
      v-if="isMobileLayout && mobileSideRailOpen && !artifactImmersiveMode"
      class="mobile-rail-backdrop"
      @click="workspaceStore.closeMobileSideRail()"
    ></div>
    <SideRail
      v-if="!artifactImmersiveMode"
      :layout-mode="isMobileLayout ? 'mobile' : 'desktop'"
      @request-close-mobile="workspaceStore.closeMobileSideRail()"
    />
    <main v-if="!artifactImmersiveMode" class="workspace-main">
      <RouterView />
    </main>
    <ArtifactHost />
  </div>
</template>

<style scoped>
.app-shell {
  --side-rail-expanded-width: 244px;
  --side-rail-collapsed-width: 60px;
  --side-rail-width: var(--side-rail-expanded-width);
  --artifact-pane-width: clamp(340px, 36vw, 440px);
  --workspace-padding: 0px;
  display: grid;
  grid-template-columns: var(--side-rail-width) minmax(0, 1fr) auto;
  height: 100vh;
  overflow: hidden;
  transition: grid-template-columns 180ms ease;
}

.app-shell.side-rail-collapsed {
  --side-rail-width: var(--side-rail-collapsed-width);
}

.app-shell.artifact-focus {
  grid-template-columns: var(--side-rail-width) minmax(0, 1fr);
}

.app-shell.artifact-immersive {
  grid-template-columns: 1fr;
}

.workspace-main {
  min-width: 0;
  min-height: 0;
  height: 100vh;
  overflow-y: auto;
  padding: var(--workspace-padding);
}

.mobile-rail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 39;
  background: rgba(32, 36, 42, 0.34);
  backdrop-filter: blur(2px);
}

.app-shell.artifact-open {
  --workspace-padding: 0px;
}

.app-shell.artifact-focus .workspace-main {
  display: none;
}

.app-shell.layout-switching {
  transition: none;
}

.app-shell.layout-switching :deep(.artifact-host),
.app-shell.layout-switching :deep(.side-rail) {
  transition: none !important;
}

@media (max-width: 1280px) {
  .app-shell {
    --artifact-pane-width: clamp(320px, 40vw, 390px);
  }
}

@media (max-width: 1160px) {
  .app-shell {
    --artifact-pane-width: clamp(300px, 44vw, 360px);
    --workspace-padding: 0px;
  }
}

@media (max-width: 960px) {
  .app-shell {
    --side-rail-width: 0px;
    height: 100vh;
    overflow: hidden;
    grid-template-columns: 1fr;
  }

  .workspace-main {
    height: 100vh;
    overflow-y: auto;
    padding: 0;
  }
}
</style>
