<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { createPraxisSsoClient, praxisSsoErrorMessage } from '../../services/praxisSsoClient';

const frameName = `praxis-frame-${crypto.randomUUID()}`;
const busy = ref(false);
const error = ref<string | null>(null);
let active = true;
const client = createPraxisSsoClient();

async function launch() {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await nextTick();
    await client.launch(undefined, frameName, () => active);
  } catch (cause) {
    if (active) error.value = praxisSsoErrorMessage(cause);
  } finally {
    if (active) busy.value = false;
  }
}

onMounted(() => { void launch(); });
onBeforeUnmount(() => { active = false; });
</script>

<template>
  <section class="praxis-embed">
    <div class="praxis-entry-status">
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-else-if="busy" role="status">正在建立 Praxis 登录会话…</p>
      <p v-else>临时入口，尚未绑定项目。若页面未显示或登录失效，请重试。</p>
      <button type="button" :disabled="busy" @click="launch">重新登录</button>
    </div>
    <iframe
      :name="frameName"
      title="Praxis 实训对话"
      sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"
      referrerpolicy="no-referrer"
    ></iframe>
  </section>
</template>

<style scoped>
.praxis-embed { display: flex; flex-direction: column; flex: 1; min-height: 540px; gap: 8px; }
.praxis-entry-status { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; }
.praxis-entry-status p { flex: 1; margin: 0; color: var(--color-text-muted); }
button { flex-shrink: 0; padding: 6px 10px; cursor: pointer; }
iframe { flex: 1; width: 100%; min-height: 480px; border: 1px solid var(--color-border); border-radius: 12px; background: white; }
</style>
