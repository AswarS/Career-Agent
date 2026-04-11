<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { runtimeConfig } from '../../config/runtime';
import { useWorkspaceStore } from '../../stores/workspace';
import { resolveTrustedCanvasUrl } from './urlCanvasPolicy';

const workspaceStore = useWorkspaceStore();
const { activeArtifact, artifactFocusMode, artifactImmersiveMode, artifactPaneOpen } = storeToRefs(workspaceStore);
const trustedUrlFrameSandbox = 'allow-scripts';

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

const artifactTypeLabel = computed(() => {
  switch (activeArtifact.value?.type) {
    case 'weekly-plan':
      return '周计划';
    case 'profile-summary':
      return '画像摘要';
    case 'career-roadmap':
      return '职业路线图';
    case 'mock-interview':
      return '模拟面试';
    case 'coding-assessment':
      return '代码题';
    case 'visual-learning':
      return '可视化学习';
    default:
      return activeArtifact.value?.type ?? '未分类';
  }
});

const artifactStatusLabel = computed(() => {
  switch (activeArtifact.value?.status) {
    case 'loading':
      return '加载中';
    case 'streaming':
      return '更新中';
    case 'stale':
      return '待刷新';
    case 'error':
      return '错误';
    case 'ready':
      return '就绪';
    default:
      return '未激活';
  }
});

const statusTitle = computed(() => {
  if (artifactIssue.value) {
    return '工件载荷不可用';
  }

  switch (activeArtifact.value?.status) {
    case 'loading':
      return '正在准备工件容器';
    case 'streaming':
      return '正在应用流式更新';
    case 'stale':
      return '当前工件版本已过期';
    case 'error':
      return '工件刷新失败';
    default:
      return '工件已就绪';
  }
});

const statusBody = computed(() => {
  if (artifactIssue.value) {
    if (activeArtifact.value?.renderMode === 'url') {
      return '当前前端仅允许相对路径，或来自受信任 allowlist 的 http/https URL 工作画布。';
    }

    return '请检查当前工件载荷是否与声明的渲染模式一致。';
  }

  switch (activeArtifact.value?.status) {
    case 'loading':
      return '宿主面板已预留显示区域，正在等待下一版载荷。';
    case 'streaming':
      return '模拟刷新正在进行，当前版本会在保留面板上下文的情况下被替换。';
    case 'stale':
      return '当前工件落后于最新上下文，建议刷新后再作为展示依据。';
    case 'error':
      return '上一次刷新未成功完成，可以在不丢失当前界面状态的前提下重试。';
    default:
      return '当前版本已经在独立宿主面板中准备完成。';
  }
});

const artifactStateClass = computed(() => (
  artifactIssue.value ? 'error' : activeArtifact.value?.status ?? 'idle'
));
</script>

<template>
  <aside class="artifact-host" :class="{ open: artifactPaneOpen, focus: artifactFocusMode, immersive: artifactImmersiveMode }">
    <div class="artifact-panel">
      <div class="artifact-header">
        <div>
          <p class="eyebrow">{{ artifactImmersiveMode ? '沉浸画布' : '工件宿主' }}</p>
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
            class="ghost-button"
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
        <div class="artifact-meta">
          <span>{{ artifactTypeLabel }}</span>
          <span>{{ activeArtifact.renderMode }}</span>
          <span>{{ artifactStatusLabel }}</span>
          <span>版本 {{ activeArtifact.revision }}</span>
        </div>

        <div class="artifact-state" :class="artifactStateClass">
          <strong>{{ statusTitle }}</strong>
          <p>{{ statusBody }}</p>
        </div>

        <iframe
          v-if="activeArtifact.renderMode === 'html' && !artifactIssue"
          class="artifact-frame"
          sandbox=""
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

        <div v-else-if="artifactIssue" class="artifact-empty">
          <p>{{ artifactIssue }}</p>
        </div>

        <div v-else class="artifact-empty">
          <p>这种工件渲染模式留待后续阶段实现。</p>
        </div>
      </template>

      <div v-else class="artifact-empty">
        <p>当前没有打开工件。</p>
        <p class="muted">可以从对话消息动作或工件中心打开周计划、模拟面试、代码题和可视化学习画布。</p>
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

.artifact-host.immersive .artifact-panel {
  width: 100vw;
  max-width: 100vw;
  padding: 20px 24px;
  border-left: 0;
  box-shadow: none;
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

.artifact-host.immersive .artifact-frame {
  min-height: calc(100vh - 206px);
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
