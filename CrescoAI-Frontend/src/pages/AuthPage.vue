<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '../stores/auth';

type AuthMode = 'login' | 'register';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { errorMessage, status } = storeToRefs(authStore);
const mode = ref<AuthMode>(route.query.mode === 'register' ? 'register' : 'login');
const localError = ref<string | null>(null);
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const form = reactive({
  displayName: '',
  username: '',
  email: '',
  identifier: '',
  password: '',
  confirmPassword: '',
});

const isRegisterMode = computed(() => mode.value === 'register');
const isSubmitting = computed(() => status.value === 'loading');
const visibleError = computed(() => localError.value ?? errorMessage.value);

function switchMode(nextMode: AuthMode) {
  mode.value = nextMode;
  localError.value = null;
}

function validateForm() {
  localError.value = null;

  if (isRegisterMode.value && !form.username.trim() && !form.email.trim()) {
    localError.value = '请至少填写用户名或邮箱。';
    return false;
  }

  if (!isRegisterMode.value && !form.identifier.trim()) {
    localError.value = '请输入邮箱或用户名。';
    return false;
  }

  if (!form.password) {
    localError.value = '请输入密码。';
    return false;
  }

  if (form.password.length < 8) {
    localError.value = '密码至少需要 8 位。';
    return false;
  }

  if (isRegisterMode.value && !form.displayName.trim()) {
    localError.value = '请输入昵称。';
    return false;
  }

  if (isRegisterMode.value && form.password !== form.confirmPassword) {
    localError.value = '两次输入的密码不一致。';
    return false;
  }

  return true;
}

async function handleSubmit() {
  if (!validateForm()) {
    return;
  }

  try {
    if (isRegisterMode.value) {
      await authStore.register({
        displayName: form.displayName.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
      });
    } else {
      await authStore.login({
        identifier: form.identifier.trim(),
        password: form.password,
      });
    }

    const redirectPath = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.replace(redirectPath.startsWith('/auth') ? '/' : redirectPath);
  } catch {
    // Store-level errorMessage owns the visible failure state.
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-panel" aria-label="账号入口">
      <header class="brand-row">
        <span class="brand-mark" aria-hidden="true">
          <img src="/brand-icon.png" alt="" />
        </span>
        <span class="brand-name">CrescoAI</span>
      </header>

      <form class="auth-form" @submit.prevent="handleSubmit">
        <div class="auth-tabs" aria-label="登录注册切换">
          <button
            type="button"
            :class="{ active: mode === 'login' }"
            :aria-pressed="mode === 'login'"
            @click="switchMode('login')"
          >
            登录
          </button>
          <button
            type="button"
            :class="{ active: mode === 'register' }"
            :aria-pressed="mode === 'register'"
            @click="switchMode('register')"
          >
            注册
          </button>
        </div>

        <label v-if="isRegisterMode" class="field-block">
          <span>昵称</span>
          <input v-model="form.displayName" type="text" autocomplete="name" placeholder="你的昵称" />
        </label>

        <label v-if="isRegisterMode" class="field-block">
          <span>用户名</span>
          <input v-model="form.username" type="text" autocomplete="username" placeholder="user_name" />
        </label>

        <label class="field-block">
          <span>{{ isRegisterMode ? '邮箱（可选）' : '邮箱或用户名' }}</span>
          <input
            v-if="isRegisterMode"
            v-model="form.email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
          />
          <input
            v-else
            v-model="form.identifier"
            type="text"
            autocomplete="username"
            placeholder="you@example.com / user_name"
          />
        </label>

        <label class="field-block">
          <span>密码</span>
          <span class="password-input-shell">
            <input
              v-model="form.password"
              class="password-input"
              :type="showPassword ? 'text' : 'password'"
              :autocomplete="isRegisterMode ? 'new-password' : 'current-password'"
              placeholder="至少 8 位"
            />
            <button
              type="button"
              class="password-visibility-button"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <svg v-if="showPassword" aria-hidden="true" viewBox="0 0 24 24">
                <path d="M3 3l18 18" />
                <path d="M10.7 10.7a2 2 0 0 0 2.6 2.6" />
                <path d="M9.9 4.3A9.2 9.2 0 0 1 12 4c5 0 8.2 4.2 9.4 6a2.7 2.7 0 0 1 0 3.1 15.3 15.3 0 0 1-2 2.5" />
                <path d="M6.1 6.4A15.4 15.4 0 0 0 2.6 10a2.7 2.7 0 0 0 0 3.1C3.8 14.9 7 19 12 19a9.7 9.7 0 0 0 4.1-.9" />
              </svg>
              <svg v-else aria-hidden="true" viewBox="0 0 24 24">
                <path d="M2.6 10.9a2.7 2.7 0 0 0 0 2.2C3.8 14.9 7 19 12 19s8.2-4.1 9.4-5.9a2.7 2.7 0 0 0 0-2.2C20.2 9.1 17 5 12 5s-8.2 4.1-9.4 5.9Z" />
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              </svg>
            </button>
          </span>
        </label>

        <label v-if="isRegisterMode" class="field-block">
          <span>确认密码</span>
          <span class="password-input-shell">
            <input
              v-model="form.confirmPassword"
              class="password-input"
              :type="showConfirmPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="再次输入密码"
            />
            <button
              type="button"
              class="password-visibility-button"
              :aria-label="showConfirmPassword ? '隐藏确认密码' : '显示确认密码'"
              :aria-pressed="showConfirmPassword"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <svg v-if="showConfirmPassword" aria-hidden="true" viewBox="0 0 24 24">
                <path d="M3 3l18 18" />
                <path d="M10.7 10.7a2 2 0 0 0 2.6 2.6" />
                <path d="M9.9 4.3A9.2 9.2 0 0 1 12 4c5 0 8.2 4.2 9.4 6a2.7 2.7 0 0 1 0 3.1 15.3 15.3 0 0 1-2 2.5" />
                <path d="M6.1 6.4A15.4 15.4 0 0 0 2.6 10a2.7 2.7 0 0 0 0 3.1C3.8 14.9 7 19 12 19a9.7 9.7 0 0 0 4.1-.9" />
              </svg>
              <svg v-else aria-hidden="true" viewBox="0 0 24 24">
                <path d="M2.6 10.9a2.7 2.7 0 0 0 0 2.2C3.8 14.9 7 19 12 19s8.2-4.1 9.4-5.9a2.7 2.7 0 0 0 0-2.2C20.2 9.1 17 5 12 5s-8.2 4.1-9.4 5.9Z" />
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              </svg>
            </button>
          </span>
        </label>

        <p v-if="visibleError" class="auth-error" aria-live="polite">{{ visibleError }}</p>

        <button type="submit" class="submit-button" :disabled="isSubmitting">
          {{ isSubmitting ? '处理中...' : '继续' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--color-bg);
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 9px;
  justify-content: center;
  color: var(--color-text);
}

.brand-mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 32px;
  aspect-ratio: 1;
  border-radius: 9px;
  overflow: hidden;
}

.brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.brand-name {
  font-family: var(--font-display);
  font-size: 1.18rem;
  font-weight: 780;
  letter-spacing: 0;
  line-height: 1;
}

.auth-panel {
  display: grid;
  grid-template-rows: auto auto;
  gap: 26px;
  width: min(100%, 390px);
  min-height: 440px;
  padding: 32px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-surface-strong);
  box-shadow: var(--shadow-card);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  min-height: 0;
}

.auth-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
  gap: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-strong);
}

.auth-tabs button {
  min-height: 42px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-weight: 800;
}

.auth-tabs button.active {
  color: var(--color-text);
  box-shadow: inset 0 -2px 0 var(--color-primary);
}

.field-block {
  display: grid;
  gap: 8px;
  color: var(--color-text);
  font-weight: 700;
}

.field-block span {
  font-size: 0.86rem;
}

.field-block input {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-strong);
  color: var(--color-text);
  padding: 0 14px;
}

.field-block input:focus {
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border));
  outline: 3px solid var(--color-focus-ring);
}

.password-input-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  align-items: center;
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-strong);
}

.password-input-shell:focus-within {
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border));
  outline: 3px solid var(--color-focus-ring);
}

.password-input-shell .password-input {
  min-height: 42px;
  border: 0;
  border-radius: 8px 0 0 8px;
  padding-right: 6px;
}

.password-input-shell .password-input:focus {
  outline: 0;
}

.password-visibility-button {
  display: grid;
  place-items: center;
  width: 38px;
  height: 100%;
  border: 0;
  border-radius: 0 8px 8px 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.password-visibility-button:hover,
.password-visibility-button:focus-visible {
  color: var(--color-text);
}

.password-visibility-button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.auth-error {
  margin: 0;
  padding: 11px 13px;
  border: 1px solid color-mix(in srgb, var(--color-danger) 22%, var(--color-border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-warning-soft) 52%, white);
  color: var(--color-danger);
  line-height: 1.45;
}

.submit-button {
  min-height: 46px;
  margin-top: 4px;
  border: 0;
  border-radius: 8px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  cursor: pointer;
  font-weight: 850;
  transition:
    background 160ms ease,
    transform 160ms ease;
}

.submit-button:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
}

.submit-button:disabled {
  cursor: wait;
  opacity: 0.68;
  transform: none;
}

@media (max-width: 900px) {
  .auth-page {
    align-items: start;
    padding: 18px;
  }

  .auth-panel {
    margin-top: 8vh;
    min-height: auto;
    padding: 22px;
  }
}
</style>
