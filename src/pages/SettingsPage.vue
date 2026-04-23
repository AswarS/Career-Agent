<template>
  <section class="page-section">
    <header class="page-header">
      <div class="page-heading">
        <MobileRailTrigger />
        <div>
          <p class="eyebrow">设置</p>
          <h1>运行状态</h1>
        </div>
      </div>
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
        <p class="card-label">上游用户 ID</p>
        <strong>{{ runtimeConfig.userId }}</strong>
        <p>用于读取当前用户的会话与画像。</p>
      </article>
      <article class="status-card">
        <p class="card-label">工件传输方式</p>
        <strong>{{ artifactTransportLabel }}</strong>
        <p>{{ artifactTransportBody }}</p>
      </article>
      <article class="status-card">
        <p class="card-label">语音输入</p>
        <strong>{{ runtimeConfig.voiceInputEnabled ? '已启用' : '已关闭' }}</strong>
        <p>控制输入区是否显示语音入口。</p>
      </article>
    </section>

    <section class="contract-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">上游契约</p>
          <h2>API 路径</h2>
        </div>
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
          <h2>上线前检查</h2>
        </div>
      </div>

      <ul class="checklist">
        <li>确认上游工件更新最终通过轮询、SSE 还是 WebSocket 下发。</li>
        <li>确认工件载荷字段名是否会与当前 snake_case 契约不同。</li>
        <li>确认画像更新在持久化前是否始终需要显式 UI 确认。</li>
        <li>确认认证与会话机制要求。</li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MobileRailTrigger from '../modules/navigation/MobileRailTrigger.vue';
import { runtimeConfig } from '../config/runtime';
import { CAREER_AGENT_API_ROUTE_DESCRIPTORS } from '../services/careerAgentApiRoutes';

const routeDescriptors = CAREER_AGENT_API_ROUTE_DESCRIPTORS;

const clientModeLabel = computed(() => (
  runtimeConfig.clientMode === 'mock' ? '离线' : '上游联调'
));

const artifactTransportLabel = computed(() => {
  switch (runtimeConfig.artifactTransport) {
    case 'mock':
      return '离线';
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
    ? '当前使用内置数据运行。'
    : '当前工作台会调用上游 API。'
));

const apiBaseUrlBody = computed(() => (
  runtimeConfig.upstreamConfigured
    ? '已配置服务地址。'
    : '未配置服务地址。'
));

const artifactTransportBody = computed(() => (
  runtimeConfig.artifactTransport === 'mock'
    ? '当前由内置数据更新。'
    : '当前使用已配置的工件更新通道。'
));
</script>

<style scoped>
@import './shared-page.css';

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.status-card,
.contract-card {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.status-card strong {
  display: block;
  margin: 0 0 10px;
  color: var(--color-text);
  font-size: 0.98rem;
}

.status-card p,
.contract-card p,
.route-table-row,
.checklist {
  color: var(--color-text-muted);
  line-height: 1.45;
}

.card-label {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1.08rem;
  line-height: 1.15;
  letter-spacing: 0;
}

.route-table {
  display: grid;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.route-table-row {
  display: grid;
  grid-template-columns: 90px minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 16px;
  padding: 10px 12px;
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
