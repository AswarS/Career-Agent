<script setup lang="ts">
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorkspaceStore } from '../stores/workspace';

const workspaceStore = useWorkspaceStore();
const { profile } = storeToRefs(workspaceStore);

onMounted(() => {
  void workspaceStore.initialize();
});
</script>

<template>
  <section class="page-section">
    <header class="page-header">
      <div>
        <p class="eyebrow">Profile Lite</p>
        <h1>{{ profile?.displayName ?? 'Loading profile...' }}</h1>
      </div>
      <p class="support-copy">
        Structured profile data is the source of truth. Conversation can suggest edits, but cannot silently rewrite this view.
      </p>
    </header>

    <div v-if="profile" class="profile-grid">
      <article class="card">
        <p class="eyebrow">Current Situation</p>
        <ul>
          <li>{{ profile.currentRole }}</li>
          <li>{{ profile.employmentStatus }}</li>
          <li>{{ profile.locationRegion }}</li>
          <li>{{ profile.weeklyTimeBudget }}</li>
        </ul>
      </article>

      <article class="card">
        <p class="eyebrow">Goals</p>
        <ul>
          <li>{{ profile.shortTermGoal }}</li>
          <li>{{ profile.longTermGoal }}</li>
          <li>{{ profile.targetRole }}</li>
        </ul>
      </article>

      <article class="card">
        <p class="eyebrow">Strengths</p>
        <ul>
          <li v-for="item in profile.keyStrengths" :key="item">{{ item }}</li>
        </ul>
      </article>

      <article class="card">
        <p class="eyebrow">Constraints</p>
        <ul>
          <li v-for="item in profile.constraints" :key="item">{{ item }}</li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
@import './shared-page.css';

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.card {
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

ul {
  margin: 0;
  padding-left: 1.2rem;
}

li {
  color: var(--color-text-muted);
  line-height: 1.7;
}

li + li {
  margin-top: 8px;
}

@media (max-width: 860px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}
</style>
