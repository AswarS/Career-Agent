<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../../stores/workspace';

const workspaceStore = useWorkspaceStore();
const { activeArtifact, artifactPaneOpen } = storeToRefs(workspaceStore);

const artifactMarkup = computed(() => {
  if (activeArtifact.value?.renderMode !== 'html') {
    return '';
  }

  return activeArtifact.value.payload.html;
});
</script>

<template>
  <aside class="artifact-host" :class="{ open: artifactPaneOpen }">
    <div class="artifact-panel">
      <div class="artifact-header">
        <div>
          <p class="eyebrow">Artifact Host</p>
          <h2>{{ activeArtifact?.title ?? 'No Active Artifact' }}</h2>
        </div>
        <button v-if="artifactPaneOpen" class="ghost-button" @click="workspaceStore.closeArtifact()">
          Close
        </button>
      </div>

      <template v-if="activeArtifact">
        <div class="artifact-meta">
          <span>{{ activeArtifact.type }}</span>
          <span>{{ activeArtifact.status }}</span>
          <span>rev {{ activeArtifact.revision }}</span>
        </div>

        <iframe
          v-if="activeArtifact.renderMode === 'html'"
          class="artifact-frame"
          sandbox=""
          :srcdoc="artifactMarkup"
          title="Artifact preview"
        ></iframe>

        <div v-else class="artifact-empty">
          <p>This artifact render mode is reserved for a later pass.</p>
        </div>
      </template>

      <div v-else class="artifact-empty">
        <p>No artifact is open.</p>
        <p class="muted">Use the conversation workspace or artifacts list to open `weekly-plan`, `profile-summary`, or `career-roadmap`.</p>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.artifact-host {
  width: 0;
  overflow: hidden;
  transition: width 180ms ease;
}

.artifact-host.open {
  width: 360px;
}

.artifact-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 360px;
  min-height: 100vh;
  padding: 18px;
  border-left: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 94%, white);
}

.artifact-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1.35rem;
  line-height: 1.1;
}

.artifact-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.artifact-meta span {
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

.artifact-frame,
.artifact-empty {
  width: 100%;
  flex: 1;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-strong);
}

.artifact-frame {
  min-height: 540px;
}

.artifact-empty {
  padding: 18px;
  color: var(--color-text);
}

.artifact-empty p {
  margin: 0;
}

.artifact-empty .muted {
  margin-top: 10px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.ghost-button {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  padding: 0.7rem 0.95rem;
  font: inherit;
  cursor: pointer;
}

@media (max-width: 1320px) {
  .artifact-host.open {
    width: 320px;
  }

  .artifact-panel {
    width: 320px;
  }
}

@media (max-width: 960px) {
  .artifact-host,
  .artifact-host.open {
    width: 100%;
  }

  .artifact-panel {
    width: 100%;
    min-height: auto;
    border-left: 0;
    border-top: 1px solid var(--color-border);
  }

  .artifact-frame {
    min-height: 360px;
  }
}
</style>
