<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import ArtifactHost from '../modules/artifacts/ArtifactHost.vue';
import SideRail from '../modules/navigation/SideRail.vue';
import { useWorkspaceStore } from '../stores/workspace';

const workspaceStore = useWorkspaceStore();

onMounted(() => {
  void workspaceStore.initialize();
});
</script>

<template>
  <div class="app-shell">
    <SideRail />
    <main class="workspace-main">
      <RouterView />
    </main>
    <ArtifactHost />
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) auto;
  min-height: 100vh;
}

.workspace-main {
  min-width: 0;
  padding: 18px;
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
