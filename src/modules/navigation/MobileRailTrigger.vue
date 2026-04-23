<script setup lang="ts">
import { useWorkspaceStore } from '../../stores/workspace';

const workspaceStore = useWorkspaceStore();
</script>

<template>
  <button
    type="button"
    class="mobile-rail-trigger"
    aria-label="打开侧边栏导航"
    @click="workspaceStore.toggleMobileSideRail()"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
    </svg>
  </button>
</template>

<style scoped>
.mobile-rail-trigger {
  display: none;
  place-items: center;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-surface-strong) 92%, white);
  color: var(--color-text);
  box-shadow: 0 4px 14px rgba(32, 36, 42, 0.08);
  cursor: pointer;
}

.mobile-rail-trigger svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

@media (max-width: 960px) {
  .mobile-rail-trigger {
    display: grid;
  }
}
</style>
