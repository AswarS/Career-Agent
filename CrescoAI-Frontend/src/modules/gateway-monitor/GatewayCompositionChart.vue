<script setup lang="ts">
import { computed } from 'vue';
import type { TokenComponent } from '../../services/gatewayMonitorClient';
import {
  componentColor,
  componentLabel,
  compositionBackground,
  formatTokens,
} from '../../pages/gatewayMonitorPresentation';

const props = defineProps<{
  title: string;
  components: TokenComponent[];
}>();

const donutStyle = computed(() => ({
  background: compositionBackground(props.components),
}));
const componentTotal = computed(() => props.components.reduce((total, item) => total + item.tokens, 0));
</script>

<template>
  <section class="composition-chart">
    <h3>{{ title }}</h3>
    <div v-if="components.length" class="composition-content">
      <div class="donut" :style="donutStyle">
        <div>
          <strong>{{ formatTokens(componentTotal) }}</strong>
          <span>Prompt</span>
        </div>
      </div>
      <div class="legend">
        <div v-for="item in components" :key="item.key">
          <i :style="{ background: componentColor(item.key) }"></i>
          <span>{{ componentLabel(item.key) }}</span>
          <strong>{{ item.percentage.toFixed(1) }}%</strong>
          <small>{{ formatTokens(item.tokens) }}</small>
        </div>
      </div>
    </div>
    <p v-else class="empty">该范围内暂无成功请求。</p>
  </section>
</template>

<style scoped>
.composition-chart {
  min-width: 0;
  padding: 14px;
  border: 1px solid #e1e6e4;
  border-radius: 12px;
  background: #fafbfa;
}

h3 {
  margin: 0 0 14px;
  font-size: .82rem;
}

.composition-content {
  display: grid;
  grid-template-columns: 150px minmax(220px, 1fr);
  align-items: center;
  gap: 18px;
}

.donut {
  display: grid;
  width: 140px;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 50%;
}

.donut > div {
  display: grid;
  width: 88px;
  aspect-ratio: 1;
  place-content: center;
  border-radius: 50%;
  text-align: center;
  background: white;
}

.donut span {
  color: #66706e;
  font-size: .68rem;
}

.legend {
  display: grid;
  gap: 9px;
}

.legend > div {
  display: grid;
  grid-template-columns: 10px 1fr 50px 62px;
  gap: 8px;
  font-size: .76rem;
}

.legend i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.legend strong,
.legend small {
  text-align: right;
}

.legend small,
.empty {
  color: #66706e;
}

.empty {
  margin: 0;
  padding: 42px 12px;
  text-align: center;
}

@media (max-width: 720px) {
  .composition-content {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .legend {
    width: 100%;
  }
}
</style>
