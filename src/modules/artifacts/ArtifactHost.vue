<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { runtimeConfig } from '../../config/runtime';
import { useWorkspaceStore } from '../../stores/workspace';
import { resolveTrustedCanvasUrl } from './urlCanvasPolicy';

const workspaceStore = useWorkspaceStore();
const { activeArtifact, artifactFocusMode, artifactImmersiveMode, artifactPaneOpen } = storeToRefs(workspaceStore);
const trustedUrlFrameSandbox = 'allow-scripts';

const htmlFrameSandbox = computed(() => {
  if (activeArtifact.value?.renderMode === 'html' && activeArtifact.value.payload.allowScripts) {
    return 'allow-scripts';
  }

  return '';
});

const artifactMarkup = computed(() => {
  if (activeArtifact.value?.renderMode !== 'html') {
    return '';
  }

  return activeArtifact.value.payload.html.trim();
});

const artifactUrl = computed(() => {
  if (activeArtifact.value?.renderMode !== 'url') {
    return null;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  return resolveTrustedCanvasUrl(activeArtifact.value.payload.url, {
    currentOrigin: window.location.origin,
    trustedOrigins: runtimeConfig.trustedCanvasOrigins,
  });
});

const artifactIssue = computed(() => {
  if (!activeArtifact.value) {
    return null;
  }

  if (activeArtifact.value.renderMode === 'html' && !artifactMarkup.value) {
    return '当前 HTML 工件缺少可渲染载荷。';
  }

  if (activeArtifact.value.renderMode === 'url' && !artifactUrl.value) {
    return '当前 URL 工件未通过宿主安全校验。';
  }

  return null;
});

const artifactNotice = computed(() => {
  if (artifactIssue.value) {
    return artifactIssue.value;
  }

  switch (activeArtifact.value?.status) {
    case 'loading':
      return '正在准备内容...';
    case 'streaming':
      return '正在更新内容...';
    case 'stale':
      return '内容可能不是最新版本。';
    case 'error':
      return '内容暂时无法显示。';
    default:
      return null;
  }
});
</script>

<template>
  <aside class="artifact-host" :class="{ open: artifactPaneOpen, focus: artifactFocusMode, immersive: artifactImmersiveMode }">
    <div class="artifact-panel">
      <div v-if="artifactImmersiveMode && activeArtifact" class="immersive-actions" aria-label="沉浸画布操作">
        <button class="ghost-button" @click="workspaceStore.restoreArtifactFocus()">
          返回聚焦
        </button>
        <button class="ghost-button" @click="workspaceStore.closeArtifact()">
          关闭
        </button>
      </div>

      <div v-if="!artifactImmersiveMode" class="artifact-header">
        <div>
          <h2>{{ activeArtifact?.title ?? '当前没有打开的工件' }}</h2>
        </div>
        <div v-if="artifactPaneOpen" class="artifact-actions">
          <button
            v-if="activeArtifact"
            class="ghost-button"
            :disabled="activeArtifact.status === 'loading' || activeArtifact.status === 'streaming'"
            @click="workspaceStore.refreshArtifact()"
          >
            刷新
          </button>
          <button
            v-if="activeArtifact && !artifactFocusMode && !artifactImmersiveMode"
            class="ghost-button"
            @click="workspaceStore.promoteArtifactFocus()"
          >
            聚焦
          </button>
          <button
            v-if="activeArtifact && !artifactImmersiveMode"
            class="ghost-button"
            @click="workspaceStore.promoteArtifactImmersive()"
          >
            沉浸
          </button>
          <button
            v-if="activeArtifact && artifactImmersiveMode"
            class="ghost-button"
            @click="workspaceStore.restoreArtifactFocus()"
          >
            返回聚焦
          </button>
          <button
            v-if="activeArtifact && (artifactFocusMode || artifactImmersiveMode)"
            class="ghost-button return-pane-button"
            @click="workspaceStore.restoreArtifactPane()"
          >
            返回侧栏
          </button>
          <button class="ghost-button" @click="workspaceStore.closeArtifact()">
            关闭
          </button>
        </div>
      </div>

      <template v-if="activeArtifact">
        <div v-if="!artifactImmersiveMode && artifactNotice" class="artifact-notice">
          {{ artifactNotice }}
        </div>

        <iframe
          v-if="activeArtifact.renderMode === 'html' && !artifactIssue"
          class="artifact-frame"
          :sandbox="htmlFrameSandbox"
          :srcdoc="artifactMarkup"
          title="工件预览"
        ></iframe>

        <iframe
          v-else-if="activeArtifact.renderMode === 'url' && !artifactIssue"
          class="artifact-frame"
          :sandbox="trustedUrlFrameSandbox"
          :src="artifactUrl ?? ''"
          title="工件应用"
        ></iframe>

        <div v-else class="artifact-empty">
          <p>{{ artifactNotice ?? '当前内容暂不可显示。' }}</p>
        </div>
      </template>

      <div v-else class="artifact-empty">
        <p>当前没有打开内容。</p>
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

.artifact-host.immersive {
  position: fixed;
  inset: 0;
  width: 100vw;
  max-width: 100vw;
  z-index: 30;
}

.artifact-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: var(--artifact-pane-width, 360px);
  min-width: 0;
  height: 100vh;
  min-height: 100vh;
  overflow-y: auto;
  padding: 12px;
  border-left: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 94%, white);
}

.artifact-host.focus .artifact-panel {
  width: calc(100vw - var(--side-rail-width, 280px));
  max-width: calc(100vw - var(--side-rail-width, 280px));
  min-width: 0;
  border-left: 1px solid var(--color-border);
  box-shadow: -12px 0 24px rgba(32, 36, 42, 0.08);
}

.artifact-host.immersive .artifact-panel {
  width: 100vw;
  max-width: 100vw;
  padding: 0;
  border-left: 0;
  background: #101417;
  box-shadow: none;
}

.immersive-actions {
  position: fixed;
  top: 14px;
  right: 14px;
  z-index: 2;
  display: flex;
  gap: 8px;
}

.artifact-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1.02rem;
  line-height: 1.1;
}

.artifact-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.artifact-notice {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  line-height: 1.45;
}

.artifact-frame,
.artifact-empty {
  width: 100%;
  flex: 1;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-strong);
}

.artifact-frame {
  min-height: 540px;
}

.artifact-host.focus .artifact-frame {
  min-height: calc(100vh - 210px);
}

.artifact-host.immersive .artifact-frame {
  min-height: 100vh;
  border: 0;
  border-radius: 0;
}

.artifact-host.immersive .immersive-empty {
  min-height: 100vh;
  border: 0;
  border-radius: 0;
}

.artifact-empty {
  display: grid;
  place-items: center;
  min-height: 220px;
  padding: 18px;
  color: var(--color-text-muted);
  text-align: center;
}

.artifact-empty p {
  margin: 0;
}

.ghost-button {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  padding: 0.52rem 0.72rem;
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
  .artifact-host {
    position: fixed;
    inset: 0;
    height: 100vh;
    width: 100vw;
    max-width: 100vw;
    z-index: 50;
    transform: translateX(100%);
    pointer-events: none;
    transition: transform 180ms ease;
  }

  .artifact-host.open,
  .artifact-host.focus,
  .artifact-host.immersive {
    transform: translateX(0);
    pointer-events: auto;
  }

  .artifact-panel {
    width: 100vw;
    height: 100vh;
    min-height: 100vh;
    border-left: 0;
    border-top: 0;
    max-width: none;
    overflow-y: auto;
  }

  .artifact-frame {
    min-height: calc(100vh - 160px);
  }

  .return-pane-button {
    display: none;
  }
}
</style>
