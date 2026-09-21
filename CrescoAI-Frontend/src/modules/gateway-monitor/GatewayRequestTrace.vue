<script setup lang="ts">
import type { MonitorRequest } from '../../services/gatewayMonitorClient';
import {
  componentColor,
  componentLabel,
  formatDuration,
  formatTime,
  formatTokens,
  shortId,
} from '../../pages/gatewayMonitorPresentation';

defineProps<{ request: MonitorRequest }>();

function outcomeLabel(outcome: string): string {
  const labels: Record<string, string> = {
    completed: '成功',
    pending: '进行中',
    http_error: 'HTTP 错误',
    network_error: '网络错误',
    cancelled: '已取消',
    invalid_response: '响应无效',
  };
  return labels[outcome] ?? outcome;
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    system: 'SYSTEM',
    user: 'USER',
    assistant: 'ASSISTANT',
    tool: 'TOOL',
  };
  return labels[role] ?? role.toUpperCase();
}
</script>

<template>
  <details :class="{ failed: request.outcome !== 'completed' && request.outcome !== 'pending' }">
    <summary>
      <strong>{{ formatTokens(request.totalTokens || request.estimatedPromptTokens) }}</strong>
      <span><small>输入</small> {{ formatTokens(request.promptTokens) }}</span>
      <span><small>输出</small> {{ formatTokens(request.completionTokens) }}</span>
      <b :style="{ color: componentColor(request.dominantCause) }">{{ componentLabel(request.dominantCause) }}</b>
      <span :class="{ failed: request.outcome !== 'completed' }">{{ outcomeLabel(request.outcome) }}</span>
      <code>{{ shortId(request.requestId) }}</code>
      <small>{{ request.model }} · {{ formatTime(request.timestamp) }} · {{ formatDuration(request.durationMs) }}</small>
    </summary>

    <div class="details">
      <p class="request-meta">
        会话 {{ request.sessionId }} · HTTP {{ request.status ?? '—' }} · 输入 Token
        {{ formatTokens(request.promptTokens) }} · 输出 Token {{ formatTokens(request.completionTokens) }} ·
        {{ request.messageCount }} 条消息
      </p>

      <div v-if="request.outcome !== 'completed' && request.outcome !== 'pending'" class="error-callout">
        <strong>{{ outcomeLabel(request.outcome) }}{{ request.status ? ` · HTTP ${request.status}` : '' }}</strong>
        <code v-if="request.errorName">{{ request.errorName }}</code>
        <pre v-if="request.errorMessage">{{ request.errorMessage }}</pre>
        <span v-else>旧记录未保存错误正文。</span>
      </div>

      <section class="trajectory-section">
        <header>
          <h3>轨迹内容</h3>
          <small>{{ request.trajectory.length }} 个上下文节点</small>
        </header>
        <div v-if="request.trajectory.length" class="trajectory">
          <article v-for="entry in request.trajectory" :key="entry.index" :class="`role-${entry.role}`">
            <header>
              <b>{{ roleLabel(entry.role) }}</b>
              <code>#{{ entry.index }}</code>
              <span v-if="entry.toolName">{{ entry.toolName }}</span>
              <small>≈ {{ formatTokens(entry.estimatedTokens) }} tokens</small>
            </header>
            <pre v-if="entry.contentPreview">{{ entry.contentPreview }}</pre>
            <p v-else-if="!entry.toolCalls?.length" class="legacy-note">旧版记录仅保留角色和 Token 元数据。</p>
            <div v-for="(call, index) in entry.toolCalls" :key="call.id ?? `${call.name}-${index}`" class="tool-call">
              <strong>调用 {{ call.name }}</strong>
              <code v-if="call.id">{{ call.id }}</code>
              <pre v-if="call.argumentsPreview">{{ call.argumentsPreview }}</pre>
            </div>
          </article>
        </div>
        <p v-else class="legacy-note">该旧版记录没有可展示的轨迹节点。</p>
      </section>

      <section class="breakdown-section">
        <h3>输入成分</h3>
        <div v-for="item in request.components.filter((component) => component.estimatedTokens > 0)" :key="item.key" class="component">
          <span>{{ componentLabel(item.key) }}</span>
          <div><i :style="{ width: `${item.percentage}%`, background: componentColor(item.key) }"></i></div>
          <strong>{{ item.percentage.toFixed(1) }}%</strong>
          <small>{{ formatTokens(request.promptTokens ? item.calibratedTokens : item.estimatedTokens) }}</small>
        </div>
      </section>

      <section v-if="request.largestToolDefinitions.length" class="schema-section">
        <h3>本次可用工具 Schema</h3>
        <p class="chips">
          <code v-for="tool in request.largestToolDefinitions.slice(0, 12)" :key="tool.name">
            {{ tool.name }} {{ formatTokens(tool.estimatedTokens) }}
          </code>
        </p>
      </section>
    </div>
  </details>
</template>

<style scoped>
details {
  overflow: hidden;
  border: 1px solid #d8dedc;
  border-radius: 11px;
}

details.failed {
  border-color: #d9a39e;
  box-shadow: inset 3px 0 #a13c35;
}

summary {
  display: grid;
  grid-template-columns: 72px 78px 78px 115px 76px 75px 1fr;
  gap: 9px;
  align-items: center;
  padding: 12px;
  cursor: pointer;
}

summary b,
summary span {
  font-size: .7rem;
}

summary span small {
  margin-right: 3px;
  color: #66706e;
}

summary .failed {
  color: #a13c35;
  font-weight: 800;
}

summary small {
  color: #66706e;
  text-align: right;
}

.details {
  padding: 14px;
  border-top: 1px solid #d8dedc;
}

.request-meta,
.legacy-note {
  color: #66706e;
  font-size: .74rem;
}

.error-callout {
  display: grid;
  gap: 7px;
  margin: 12px 0;
  padding: 12px;
  border-radius: 9px;
  color: #842d27;
  background: #fbe9e7;
  font-size: .76rem;
}

.error-callout code {
  justify-self: start;
}

h3 {
  margin: 0;
  font-size: .78rem;
}

.trajectory-section,
.breakdown-section,
.schema-section {
  margin-top: 18px;
}

.trajectory-section > header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.trajectory-section > header small {
  color: #66706e;
}

.trajectory {
  display: grid;
  gap: 8px;
}

.trajectory article {
  overflow: hidden;
  border: 1px solid #e1e6e4;
  border-left: 3px solid #80858b;
  border-radius: 8px;
  background: #fafbfa;
}

.trajectory .role-system { border-left-color: #315f58; }
.trajectory .role-user { border-left-color: #9a846c; }
.trajectory .role-assistant { border-left-color: #766b87; }
.trajectory .role-tool { border-left-color: #a95550; }

.trajectory article > header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid #e8ecea;
  font-size: .68rem;
}

.trajectory article > header small {
  margin-left: auto;
  color: #66706e;
}

pre {
  margin: 0;
  padding: 10px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #283330;
  background: white;
  font: .72rem/1.55 Consolas, monospace;
}

.tool-call {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 7px;
  padding: 9px 10px;
  border-top: 1px dashed #d8dedc;
  background: #f4f6f5;
  font-size: .72rem;
}

.tool-call > code {
  color: #66706e;
}

.tool-call pre {
  grid-column: 1 / -1;
  border-radius: 6px;
}

.component {
  display: grid;
  grid-template-columns: 140px 1fr 50px 65px;
  gap: 9px;
  align-items: center;
  margin: 7px 0;
  font-size: .72rem;
}

.component > div {
  height: 8px;
  overflow: hidden;
  border-radius: 99px;
  background: #edf0ef;
}

.component i {
  display: block;
  height: 100%;
}

.component strong,
.component small {
  text-align: right;
}

.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chips code {
  padding: 5px;
  border-radius: 7px;
  background: #edf0ef;
}

@media (max-width: 720px) {
  summary {
    grid-template-columns: 62px 72px 72px 1fr 65px;
  }

  summary > code,
  summary > small {
    display: none;
  }

  .component {
    grid-template-columns: 105px 1fr 45px;
  }

  .component small {
    display: none;
  }
}
</style>
