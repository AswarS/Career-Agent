<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterView } from 'vue-router';
import ArtifactHost from '../modules/artifacts/ArtifactHost.vue';
import SideRail from '../modules/navigation/SideRail.vue';
import { useWorkspaceStore } from '../stores/workspace';

const workspaceStore = useWorkspaceStore();
const { artifactFocusMode, artifactPaneOpen, sideRailCollapsed } = storeToRefs(workspaceStore);

const shellClasses = computed(() => ({
  'artifact-open': artifactPaneOpen.value,
  'artifact-focus': artifactFocusMode.value,
  'side-rail-collapsed': sideRailCollapsed.value,
}));

onMounted(() => {
  void workspaceStore.initialize();
});
</script>

<template>
  <div class="app-shell" :class="shellClasses">
    <SideRail />
    <main class="workspace-main">
      <RouterView />
    </main>
    <ArtifactHost />
  </div>
</template>

<style scoped>
.app-shell {
  --side-rail-expanded-width: 280px;
  --side-rail-collapsed-width: 96px;
  --side-rail-width: var(--side-rail-expanded-width);
  --artifact-pane-width: clamp(340px, 36vw, 440px);
  --workspace-padding: 18px;
  display: grid;
  grid-template-columns: var(--side-rail-width) minmax(0, 1fr) auto;
  height: 100vh;
  overflow: hidden;
}

.app-shell.side-rail-collapsed {
  --side-rail-width: var(--side-rail-collapsed-width);
}

.app-shell.artifact-focus {
  grid-template-columns: var(--side-rail-width) minmax(0, 1fr);
}

.workspace-main {
  min-width: 0;
  min-height: 0;
  height: 100vh;
  overflow-y: auto;
  padding: var(--workspace-padding);
}

.app-shell.artifact-open {
  --workspace-padding: 16px;
}

.app-shell.artifact-focus .workspace-main {
  display: none;
}

@media (max-width: 1280px) {
  .app-shell {
    --artifact-pane-width: clamp(320px, 40vw, 390px);
  }
}

@media (max-width: 1160px) {
  .app-shell {
    --artifact-pane-width: clamp(300px, 44vw, 360px);
    --workspace-padding: 14px;
  }
}

@media (max-width: 960px) {
  .app-shell {
    height: auto;
    overflow: visible;
    grid-template-columns: 1fr;
  }

  .workspace-main {
    height: auto;
    overflow: visible;
    padding: 14px;
  }
}
</style>
