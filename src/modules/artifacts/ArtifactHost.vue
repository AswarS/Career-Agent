<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../../stores/workspace';

const workspaceStore = useWorkspaceStore();
const { activeArtifact, artifactFocusMode, artifactPaneOpen } = storeToRefs(workspaceStore);

const artifactMarkup = computed(() => {
  if (activeArtifact.value?.renderMode !== 'html') {
    return '';
  }

  return activeArtifact.value.payload.html;
});

const statusTitle = computed(() => {
  switch (activeArtifact.value?.status) {
    case 'loading':
      return 'Preparing artifact shell';
    case 'streaming':
      return 'Applying streamed update';
    case 'stale':
      return 'Artifact is stale';
    case 'error':
      return 'Artifact refresh failed';
    default:
      return 'Artifact ready';
  }
});

const statusBody = computed(() => {
  switch (activeArtifact.value?.status) {
    case 'loading':
      return 'The host has reserved the surface and is waiting for the next revision payload.';
    case 'streaming':
      return 'A mock refresh is in progress. The current revision will be replaced without leaving the shell.';
    case 'stale':
      return 'This artifact is older than the latest known context. Refresh it before relying on the output.';
    case 'error':
      return 'The last refresh attempt did not complete cleanly. You can retry without losing the current shell state.';
    default:
      return 'The current revision is ready inside the isolated host surface.';
  }
});
</script>

<template>
  <aside class="artifact-host" :class="{ open: artifactPaneOpen, focus: artifactFocusMode }">
    <div class="artifact-panel">
      <div class="artifact-header">
        <div>
          <p class="eyebrow">Artifact Host</p>
          <h2>{{ activeArtifact?.title ?? 'No Active Artifact' }}</h2>
        </div>
        <div v-if="artifactPaneOpen" class="artifact-actions">
          <button
            v-if="activeArtifact"
            class="ghost-button"
            :disabled="activeArtifact.status === 'loading' || activeArtifact.status === 'streaming'"
            @click="workspaceStore.refreshArtifact()"
          >
            Refresh
          </button>
          <button
            v-if="activeArtifact && !artifactFocusMode"
            class="ghost-button"
            @click="workspaceStore.promoteArtifactFocus()"
          >
            Focus
          </button>
          <button
            v-if="activeArtifact && artifactFocusMode"
            class="ghost-button"
            @click="workspaceStore.restoreArtifactPane()"
          >
            Back To Pane
          </button>
          <button class="ghost-button" @click="workspaceStore.closeArtifact()">
            Close
          </button>
        </div>
      </div>

      <template v-if="activeArtifact">
        <div class="artifact-meta">
          <span>{{ activeArtifact.type }}</span>
          <span>{{ activeArtifact.status }}</span>
          <span>rev {{ activeArtifact.revision }}</span>
        </div>

        <div class="artifact-state" :class="activeArtifact.status">
          <strong>{{ statusTitle }}</strong>
          <p>{{ statusBody }}</p>
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
  min-width: 0;
  height: 100vh;
  width: 0;
  overflow: hidden;
  transition: width 180ms ease;
}

.artifact-host.open {
  width: var(--artifact-pane-width, 360px);
}

.artifact-host.focus {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: var(--side-rail-width, 280px);
  width: calc(100vw - var(--side-rail-width, 280px));
  max-width: calc(100vw - var(--side-rail-width, 280px));
  z-index: 20;
}

.artifact-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: var(--artifact-pane-width, 360px);
  min-width: 0;
  height: 100vh;
  min-height: 100vh;
  overflow-y: auto;
  padding: 18px;
  border-left: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 94%, white);
}

.artifact-host.focus .artifact-panel {
  width: calc(100vw - var(--side-rail-width, 280px));
  max-width: calc(100vw - var(--side-rail-width, 280px));
  min-width: 0;
  border-left: 1px solid var(--color-border);
  box-shadow: -20px 0 40px rgba(35, 49, 59, 0.08);
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

.artifact-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
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

.artifact-state {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-subtle) 82%, white);
}

.artifact-state strong {
  color: var(--color-text);
}

.artifact-state p {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.artifact-state.loading {
  background: color-mix(in srgb, var(--color-bg-subtle) 65%, white);
}

.artifact-state.streaming {
  background: color-mix(in srgb, var(--color-primary-soft) 55%, white);
}

.artifact-state.stale {
  background: color-mix(in srgb, var(--color-warning-soft) 68%, white);
}

.artifact-state.error {
  background: color-mix(in srgb, #f4d7d2 74%, white);
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

.artifact-host.focus .artifact-frame {
  min-height: calc(100vh - 210px);
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
  .artifact-host.focus {
    width: calc(100vw - var(--side-rail-width, 280px));
    max-width: calc(100vw - var(--side-rail-width, 280px));
  }

  .artifact-host.focus .artifact-panel {
    width: calc(100vw - var(--side-rail-width, 280px));
    max-width: calc(100vw - var(--side-rail-width, 280px));
  }
}

@media (max-width: 960px) {
  .artifact-host,
  .artifact-host.open,
  .artifact-host.focus {
    position: static;
    inset: auto;
    height: auto;
    width: 100%;
    max-width: none;
  }

  .artifact-panel {
    width: 100%;
    height: auto;
    min-height: auto;
    border-left: 0;
    border-top: 1px solid var(--color-border);
    max-width: none;
    overflow: visible;
  }

  .artifact-frame {
    min-height: 360px;
  }
}
</style>
