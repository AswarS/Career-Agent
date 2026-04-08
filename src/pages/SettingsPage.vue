<template>
  <section class="page-section">
    <header class="page-header">
      <div>
        <p class="eyebrow">Settings</p>
        <h1>Integration Runtime</h1>
      </div>
      <p class="support-copy">
        This page exposes the current frontend runtime mode, the expected upstream routes, and the contract edges that still need team alignment.
      </p>
    </header>

    <section class="status-grid">
      <article class="status-card">
        <p class="card-label">Client Mode</p>
        <strong>{{ runtimeConfig.clientMode }}</strong>
        <p>{{ clientModeBody }}</p>
      </article>
      <article class="status-card">
        <p class="card-label">API Base URL</p>
        <strong>{{ runtimeConfig.apiBaseUrl ?? 'Not configured' }}</strong>
        <p>{{ apiBaseUrlBody }}</p>
      </article>
      <article class="status-card">
        <p class="card-label">Artifact Transport</p>
        <strong>{{ runtimeConfig.artifactTransport }}</strong>
        <p>{{ artifactTransportBody }}</p>
      </article>
      <article class="status-card">
        <p class="card-label">Voice Input</p>
        <strong>{{ runtimeConfig.voiceInputEnabled ? 'Enabled' : 'Disabled' }}</strong>
        <p>Voice remains a later-phase UI path and is off by default.</p>
      </article>
    </section>

    <section class="contract-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Upstream Contract</p>
          <h2>Reserved API Paths</h2>
        </div>
        <p class="support-copy">
          These routes define the current frontend expectation for the upstream `claude-code-rev` integration.
        </p>
      </div>

      <div class="route-table" role="table" aria-label="Career agent API routes">
        <div class="route-table-row route-table-head" role="row">
          <span role="columnheader">Method</span>
          <span role="columnheader">Path</span>
          <span role="columnheader">Purpose</span>
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
          <p class="eyebrow">Review Checklist</p>
          <h2>Cross-Team Decisions Still Needed</h2>
        </div>
        <p class="support-copy">
          The frontend is now typed for these boundaries, but the final answers still belong to the integration discussion.
        </p>
      </div>

      <ul class="checklist">
        <li>Confirm whether upstream artifact pushes land via polling, SSE, or WebSocket.</li>
        <li>Confirm the final artifact payload field names if they differ from the current snake_case route contract.</li>
        <li>Confirm whether profile updates always require explicit UI confirmation before persistence.</li>
        <li>Confirm auth and session requirements before replacing mock runtime mode.</li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { runtimeConfig } from '../config/runtime';
import { CAREER_AGENT_API_ROUTE_DESCRIPTORS } from '../services/careerAgentApiRoutes';

const routeDescriptors = CAREER_AGENT_API_ROUTE_DESCRIPTORS;

const clientModeBody = computed(() => (
  runtimeConfig.clientMode === 'mock'
    ? 'The workspace uses local typed mock data. No upstream dependency is required for frontend development.'
    : 'The workspace will call the upstream API client. This mode should only be used after route and payload alignment.'
));

const apiBaseUrlBody = computed(() => (
  runtimeConfig.upstreamConfigured
    ? 'The upstream adapter is configured and can be wired without changing the store boundary.'
    : 'The frontend remains in a safe local mode until a real upstream base URL is ready.'
));

const artifactTransportBody = computed(() => (
  runtimeConfig.artifactTransport === 'mock'
    ? 'Artifact revisions are simulated locally for now.'
    : 'The transport is reserved for real artifact updates once upstream delivery is connected.'
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
