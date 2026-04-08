<template>
  <section class="page-section">
    <header class="page-header">
      <div>
        <p class="eyebrow">设置</p>
        <h1>集成运行态</h1>
      </div>
      <p class="support-copy">
        这里展示当前前端运行模式、预留的上游接口，以及仍需团队对齐的边界约束。
      </p>
    </header>

    <section class="status-grid">
      <article class="status-card">
        <p class="card-label">客户端模式</p>
        <strong>{{ clientModeLabel }}</strong>
        <p>{{ clientModeBody }}</p>
      </article>
      <article class="status-card">
        <p class="card-label">API 基础地址</p>
        <strong>{{ runtimeConfig.apiBaseUrl ?? '未配置' }}</strong>
        <p>{{ apiBaseUrlBody }}</p>
      </article>
      <article class="status-card">
        <p class="card-label">工件传输方式</p>
        <strong>{{ artifactTransportLabel }}</strong>
        <p>{{ artifactTransportBody }}</p>
      </article>
      <article class="status-card">
        <p class="card-label">语音输入</p>
        <strong>{{ runtimeConfig.voiceInputEnabled ? '已启用' : '已关闭' }}</strong>
        <p>语音仍属于后续阶段能力，当前默认关闭。</p>
      </article>
    </section>

    <section class="contract-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">上游契约</p>
          <h2>预留 API 路径</h2>
        </div>
        <p class="support-copy">
          这些路由定义了当前前端对上游 `claude-code-rev` 集成的接口预期。
        </p>
      </div>

      <div class="route-table" role="table" aria-label="职业规划助手 API 路由">
        <div class="route-table-row route-table-head" role="row">
          <span role="columnheader">方法</span>
          <span role="columnheader">路径</span>
          <span role="columnheader">用途</span>
        </div>
        <div
          v-for="route in routeDescriptors"
          :key="`${route.method}-${route.path}`"
          class="route-table-row"
          role="row"
        >
          <span class="route-method" role="cell">{{ route.method }}</span>
          <code role="cell">{{ route.path }}</code>
          <span role="cell">{{ route.purpose }}</span>
        </div>
      </div>
    </section>

    <section class="contract-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">评审清单</p>
          <h2>仍待跨团队确认的事项</h2>
        </div>
        <p class="support-copy">
          前端已经为这些边界建立了类型约束，但最终方案仍需在联调阶段确认。
        </p>
      </div>

      <ul class="checklist">
        <li>确认上游工件更新最终通过轮询、SSE 还是 WebSocket 下发。</li>
        <li>确认工件载荷字段名是否会与当前 snake_case 契约不同。</li>
        <li>确认画像更新在持久化前是否始终需要显式 UI 确认。</li>
        <li>在替换 mock 运行模式前，确认认证与会话机制要求。</li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { runtimeConfig } from '../config/runtime';
import { CAREER_AGENT_API_ROUTE_DESCRIPTORS } from '../services/careerAgentApiRoutes';

const routeDescriptors = CAREER_AGENT_API_ROUTE_DESCRIPTORS;

const clientModeLabel = computed(() => (
  runtimeConfig.clientMode === 'mock' ? '本地模拟' : '上游联调'
));

const artifactTransportLabel = computed(() => {
  switch (runtimeConfig.artifactTransport) {
    case 'mock':
      return '本地模拟';
    case 'polling':
      return '轮询';
    case 'sse':
      return 'SSE';
    case 'websocket':
      return 'WebSocket';
    default:
      return runtimeConfig.artifactTransport;
  }
});

const clientModeBody = computed(() => (
  runtimeConfig.clientMode === 'mock'
    ? '当前工作台使用本地类型化 mock 数据，前端开发不依赖上游服务。'
    : '当前工作台会调用上游 API 客户端，这个模式应只在路由和载荷对齐后启用。'
));

const apiBaseUrlBody = computed(() => (
  runtimeConfig.upstreamConfigured
    ? '上游适配层已经具备接线条件，无需调整 store 边界即可接入。'
    : '在真实上游地址准备好之前，前端仍保持安全的本地运行模式。'
));

const artifactTransportBody = computed(() => (
  runtimeConfig.artifactTransport === 'mock'
    ? '当前工件版本更新由本地模拟。'
    : '该传输方式预留给后续真实上游工件更新。'
));
</script>

<style scoped>
@import './shared-page.css';

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.status-card,
.contract-card {
  padding: 22px 24px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.status-card strong {
  display: block;
  margin: 0 0 10px;
  color: var(--color-text);
  font-size: 1.1rem;
}

.status-card p,
.contract-card p,
.route-table-row,
.checklist {
  color: var(--color-text-muted);
  line-height: 1.7;
}

.card-label {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 2.5vw, 2rem);
  line-height: 1;
  letter-spacing: -0.03em;
}

.route-table {
  display: grid;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  overflow: hidden;
}

.route-table-row {
  display: grid;
  grid-template-columns: 90px minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.46);
}

.route-table-row + .route-table-row {
  border-top: 1px solid var(--color-border);
}

.route-table-head {
  background: rgba(217, 240, 235, 0.42);
  color: var(--color-text);
  font-weight: 700;
}

.route-method {
  color: var(--color-primary);
  font-weight: 700;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--color-text);
}

.checklist {
  margin: 0;
  padding-left: 18px;
}

.checklist li + li {
  margin-top: 10px;
}

@media (max-width: 960px) {
  .section-heading {
    flex-direction: column;
  }

  .route-table-row {
    grid-template-columns: 1fr;
  }
}
</style>
