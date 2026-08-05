<script setup lang="ts">
import { onMounted } from 'vue';
import { praxisSsoEntryController } from '../services/praxisSsoEntry';

const { state, startAutomatically, retry } = praxisSsoEntryController;

onMounted(() => {
  void startAutomatically();
});
</script>

<template>
  <main class="sso-page">
    <section class="sso-panel" aria-labelledby="praxis-sso-title">
      <span class="brand-mark" aria-hidden="true">
        <img src="/brand-icon.png" alt="" />
      </span>

      <div class="sso-copy">
        <h1 id="praxis-sso-title">正在进入 Praxis</h1>
        <p v-if="state.status !== 'error'" aria-live="polite">
          正在安全地建立登录会话，请稍候…
        </p>
        <p v-else class="sso-error" role="alert">
          {{ state.errorMessage }}
        </p>
      </div>

      <span v-if="state.status !== 'error'" class="sso-spinner" aria-hidden="true"></span>
      <button v-else type="button" class="retry-button" @click="retry">
        重新尝试
      </button>
    </section>
  </main>
</template>

<style scoped>
.sso-page {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  background: var(--color-bg);
}

.sso-panel {
  display: grid;
  justify-items: center;
  gap: 22px;
  width: min(100%, 420px);
  padding: 38px 34px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-surface-strong);
  box-shadow: var(--shadow-card);
  text-align: center;
}

.brand-mark {
  display: grid;
  width: 42px;
  aspect-ratio: 1;
  place-items: center;
  overflow: hidden;
  border-radius: 11px;
}

.brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.sso-copy {
  display: grid;
  gap: 9px;
}

.sso-copy h1,
.sso-copy p {
  margin: 0;
}

.sso-copy h1 {
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1.35rem;
}

.sso-copy p {
  color: var(--color-text-muted);
  line-height: 1.55;
}

.sso-copy .sso-error {
  color: var(--color-danger);
}

.sso-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 800ms linear infinite;
}

.retry-button {
  min-height: 42px;
  padding: 0 20px;
  border: 0;
  border-radius: 8px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}

.retry-button:hover,
.retry-button:focus-visible {
  background: var(--color-primary-hover);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sso-spinner {
    animation: none;
  }
}
</style>
