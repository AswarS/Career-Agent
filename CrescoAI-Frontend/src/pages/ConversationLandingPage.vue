<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import ConversationComposer from '../modules/conversation/ConversationComposer.vue';
import MobileRailTrigger from '../modules/navigation/MobileRailTrigger.vue';
import { useWorkspaceStore } from '../stores/workspace';
import type { DraftMessageSubmission } from '../types/entities';

interface StarterCard {
  title: string;
  description: string;
  prompt: string;
}

const starterCards: StarterCard[] = [
  {
    title: '本周规划',
    description: '梳理工作、学习和恢复节奏。',
    prompt: '请根据我当前的交付任务、学习安排和恢复节奏，帮我做一份本周计划。',
  },
  {
    title: '职业方向',
    description: '拆解目标岗位与能力缺口。',
    prompt: '请帮我梳理从当前岗位到目标岗位的成长路线和关键能力缺口。',
  },
  {
    title: '模拟面试',
    description: '进入一轮结构化练习。',
    prompt: '请基于门店店长岗位，和我做一轮结构化模拟面试。',
  },
  {
    title: '图片观察',
    description: '整理多模态观察框架。',
    prompt: '我会上传图片，请先帮我整理观察重点、判断框架和输出结构。',
  },
];

const router = useRouter();
const workspaceStore = useWorkspaceStore();
const { errorMessage, profile, threadCreateStatus } = storeToRefs(workspaceStore);

const welcomeName = computed(() => {
  const displayName = profile.value?.displayName?.trim();
  return displayName || '你好';
});

onMounted(() => {
  workspaceStore.closeArtifact();
});

async function startConversation(submission: DraftMessageSubmission) {
  try {
    const thread = await workspaceStore.startThreadFromDraft(submission);

    if (!thread) {
      return;
    }

    await router.push(`/threads/${thread.id}`);
  } catch {
    // Store-level errorMessage owns the visible failure state.
  }
}

async function handleSubmit(submission: DraftMessageSubmission) {
  await startConversation(submission);
}

async function handleStarterCardClick(prompt: string) {
  await startConversation({
    content: prompt,
    attachments: [],
  });
}
</script>

<template>
  <section class="page-section landing-page">
    <header class="page-header landing-header">
      <div class="page-heading">
        <MobileRailTrigger />
        <h1>新对话</h1>
      </div>
    </header>

    <section class="landing-scroll-region" aria-label="新对话工作台">
      <div class="landing-scroll-content">
        <section class="landing-hero">
          <h2>{{ welcomeName }}，有什么可以帮你的？</h2>
        </section>

        <section class="landing-composer-wrap">
          <ConversationComposer
            :disabled="threadCreateStatus === 'loading'"
            @submit="handleSubmit"
          />
        </section>

        <section v-if="threadCreateStatus === 'error'" class="landing-error" aria-live="polite">
          <p>{{ errorMessage ?? '新会话创建失败，请稍后再试。' }}</p>
        </section>

        <section class="starter-grid" aria-label="建议发起方式">
          <button
            v-for="card in starterCards"
            :key="card.title"
            type="button"
            class="starter-card"
            :disabled="threadCreateStatus === 'loading'"
            @click="handleStarterCardClick(card.prompt)"
          >
            <strong>{{ card.title }}</strong>
            <p>{{ card.description }}</p>
          </button>
        </section>
      </div>
    </section>
  </section>
</template>

<style scoped>
@import './shared-page.css';

.landing-page {
  height: 100vh;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  padding: 16px 0 0;
}

.landing-page > .page-header {
  margin: 0 18px;
}

.landing-header {
  justify-content: flex-start;
}

.landing-scroll-region {
  min-height: 0;
  overflow-y: auto;
}

.landing-scroll-content {
  display: grid;
  justify-items: center;
  gap: 22px;
  min-height: 100%;
  padding: clamp(30px, 11vh, 96px) clamp(18px, 7vw, 120px) 28px;
  align-content: start;
}

.landing-hero {
  display: grid;
  gap: 10px;
  justify-items: center;
  text-align: center;
}

.landing-hero h2 {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 3.5rem);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: 0;
}

.landing-composer-wrap,
.starter-grid,
.landing-error {
  width: min(980px, 66vw);
  max-width: 100%;
}

.landing-composer-wrap :deep(.composer-card) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-strong);
  box-shadow: 0 10px 36px rgba(24, 31, 38, 0.08);
}

.landing-error {
  display: grid;
  padding: 12px 16px;
  border: 1px solid color-mix(in srgb, var(--color-danger) 18%, var(--color-border));
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-warning-soft) 44%, white);
}

.landing-error p {
  margin: 0;
  color: var(--color-text);
  line-height: 1.45;
}

.starter-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.starter-card {
  display: grid;
  gap: 8px;
  min-height: 108px;
  padding: 18px 20px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    transform 160ms ease,
    box-shadow 160ms ease;
}

.starter-card:hover {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-surface-strong) 82%, var(--color-primary-soft));
  box-shadow: 0 10px 24px rgba(24, 31, 38, 0.06);
  transform: translateY(-1px);
}

.starter-card:disabled {
  cursor: wait;
  opacity: 0.68;
  transform: none;
  box-shadow: none;
}

.starter-card strong {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
}

.starter-card p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

@media (max-width: 960px) {
  .landing-page {
    padding-top: 10px;
  }

  .landing-page > .page-header {
    margin: 0 12px;
  }

  .landing-scroll-content {
    padding: 36px 12px 20px;
    gap: 18px;
  }

  .landing-composer-wrap,
  .starter-grid,
  .landing-error {
    width: min(760px, calc(100vw - 24px));
  }

  .landing-hero h2 {
    font-size: clamp(1.7rem, 7vw, 2.8rem);
  }
}

@media (max-width: 720px) {
  .starter-grid {
    grid-template-columns: 1fr;
  }
}
</style>
