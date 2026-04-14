<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../stores/workspace';
import type { ArtifactRecord } from '../types/entities';

const workspaceStore = useWorkspaceStore();
const { artifacts } = storeToRefs(workspaceStore);

onMounted(() => {
  void workspaceStore.initialize();
});

const groupedArtifacts = computed(() => artifacts.value);

function formatArtifactType(artifact: ArtifactRecord) {
  switch (artifact.type) {
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
    case 'app-example':
      return '应用示例';
    default:
      return artifact.type;
  }
}

function formatArtifactStatus(artifact: ArtifactRecord) {
  switch (artifact.status) {
    case 'idle':
      return '未激活';
    case 'loading':
      return '加载中';
    case 'streaming':
      return '更新中';
    case 'ready':
      return '就绪';
    case 'stale':
      return '待刷新';
    case 'error':
      return '错误';
    default:
      return artifact.status;
  }
}
</script>

<template>
  <section class="page-section">
    <header class="page-header">
      <div>
        <p class="eyebrow">工件中心</p>
        <h1>阶段成果工件总览</h1>
      </div>
      <p class="support-copy">
        这个页面用于展示前端已经可以独立列出结构化工件，而不依赖实时后端联调。
      </p>
    </header>

    <div class="artifact-list">
      <article v-for="artifact in groupedArtifacts" :key="artifact.id" class="card">
        <div class="card-meta">
          <span>{{ formatArtifactType(artifact) }}</span>
          <span>{{ formatArtifactStatus(artifact) }}</span>
        </div>
        <h2>{{ artifact.title }}</h2>
        <p>{{ artifact.summary }}</p>
        <div class="action-row">
          <button class="primary-button" @click="workspaceStore.openArtifact(artifact.id)">
            在右侧打开
          </button>
          <button class="secondary-button" @click="workspaceStore.openArtifact(artifact.id).then(() => workspaceStore.refreshArtifact(artifact.id))">
            刷新版本
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
@import './shared-page.css';

.artifact-list {
  display: grid;
  gap: 14px;
}

.card {
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.card-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.card-meta span {
  padding: 0.38rem 0.6rem;
  border-radius: 999px;
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  font-size: 0.76rem;
  font-weight: 700;
}

h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1.35rem;
}

.card p {
  margin: 12px 0 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.primary-button {
  margin-top: 18px;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.primary-button,
.secondary-button {
  border-radius: 999px;
  padding: 0.82rem 1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  margin-top: 0;
}

.secondary-button {
  border: 1px solid var(--color-border);
  background: var(--color-surface-strong);
  color: var(--color-text);
}
</style>
