<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterView } from 'vue-router';
import ArtifactHost from '../modules/artifacts/ArtifactHost.vue';
import SideRail from '../modules/navigation/SideRail.vue';
import { useWorkspaceStore } from '../stores/workspace';

const workspaceStore = useWorkspaceStore();
const { artifactFocusMode } = storeToRefs(workspaceStore);

const shellClasses = computed(() => ({
  'artifact-focus': artifactFocusMode.value,
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
  --side-rail-width: 280px;
  display: grid;
  grid-template-columns: var(--side-rail-width) minmax(0, 1fr) auto;
  min-height: 100vh;
}

.app-shell.artifact-focus {
  grid-template-columns: var(--side-rail-width) minmax(0, 1fr);
}

.workspace-main {
  min-width: 0;
  padding: 18px;
}

.app-shell.artifact-focus .workspace-main {
  display: none;
}

@media (max-width: 960px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .workspace-main {
    padding: 14px;
  }
}
</style>
