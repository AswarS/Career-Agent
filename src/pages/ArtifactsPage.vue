<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../stores/workspace';

const workspaceStore = useWorkspaceStore();
const { artifacts } = storeToRefs(workspaceStore);

onMounted(() => {
  void workspaceStore.initialize();
});

const groupedArtifacts = computed(() => artifacts.value);
</script>

<template>
  <section class="page-section">
    <header class="page-header">
      <div>
        <p class="eyebrow">Artifacts</p>
        <h1>First-pass artifact catalog</h1>
      </div>
      <p class="support-copy">
        This page verifies that the frontend can list typed artifacts without depending on live backend integration.
      </p>
    </header>

    <div class="artifact-list">
      <article v-for="artifact in groupedArtifacts" :key="artifact.id" class="card">
        <div class="card-meta">
          <span>{{ artifact.type }}</span>
          <span>{{ artifact.status }}</span>
        </div>
        <h2>{{ artifact.title }}</h2>
        <p>{{ artifact.summary }}</p>
        <button class="primary-button" @click="workspaceStore.openArtifact(artifact.id)">
          Open In Host
        </button>
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
</style>
