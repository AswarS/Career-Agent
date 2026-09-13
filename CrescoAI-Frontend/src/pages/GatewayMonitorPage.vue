<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { getGatewayMonitorSummary, type GatewayMonitorRange, type GatewayMonitorSummary, type MonitorSession } from '../services/gatewayMonitorClient';

const range = ref<GatewayMonitorRange>('24h');
const drilldownSessionId = ref('');
const baselineSessionId = ref('');
const candidateSessionId = ref('');
const data = ref<GatewayMonitorSummary | null>(null);
const loading = ref(false);
const error = ref('');
const autoRefresh = ref(true);
let timer: number | null = null;

const colors: Record<string, string> = { system:'#315f58',tool_definitions:'#5f8f86',user_messages:'#9a846c',assistant_history:'#766b87',assistant_tool_calls:'#b3834c',tool_results:'#a95550',other:'#80858b',wrapper_overhead:'#b8b3aa' };
const labels: Record<string, string> = { system:'System Prompt',tool_definitions:'工具 Schema',user_messages:'用户与框架消息',assistant_history:'助手历史',assistant_tool_calls:'工具调用',tool_results:'工具结果',other:'其他',wrapper_overhead:'协议开销',unknown:'等待数据' };
const totals = computed(() => data.value?.totals);
const maxTrend = computed(() => Math.max(1, ...(data.value?.trend.map((item) => item.totalTokens) ?? [])));
const maxTool = computed(() => Math.max(1, ...(data.value?.toolSchemas.map((item) => item.tokens) ?? [])));
const visibleRequests = computed(() => drilldownSessionId.value
  ? (data.value?.requests ?? []).filter((request) => request.sessionId === drilldownSessionId.value)
  : (data.value?.requests ?? []));
const baselineSession = computed(() => data.value?.sessions.find((session) => session.sessionId === baselineSessionId.value));
const candidateSession = computed(() => data.value?.sessions.find((session) => session.sessionId === candidateSessionId.value));
const comparisonRows = computed(() => [
  ['实际总 Token', baselineSession.value?.totalTokens ?? 0, candidateSession.value?.totalTokens ?? 0],
  ['实际 Prompt', baselineSession.value?.promptTokens ?? 0, candidateSession.value?.promptTokens ?? 0],
  ['工具 Schema', sessionComponent(baselineSession.value, 'tool_definitions'), sessionComponent(candidateSession.value, 'tool_definitions')],
  ['工具结果', sessionComponent(baselineSession.value, 'tool_results'), sessionComponent(candidateSession.value, 'tool_results')],
  ['System Prompt', sessionComponent(baselineSession.value, 'system'), sessionComponent(candidateSession.value, 'system')],
  ['失败请求负载', baselineSession.value?.failedAttemptedPromptTokens ?? 0, candidateSession.value?.failedAttemptedPromptTokens ?? 0],
] as const);
const donut = computed(() => {
  let cursor = 0;
  const stops = (data.value?.componentShares ?? []).map((item) => { const start = cursor; cursor += item.percentage; return `${color(item.key)} ${start}% ${cursor}%`; });
  return { background: stops.length ? `conic-gradient(${stops.join(',')})` : '#e5e7eb' };
});
function color(key:string){ return colors[key] ?? '#80858b'; }
function label(key:string){ return labels[key] ?? key; }
function tokens(value=0){ return value>=1e6?`${(value/1e6).toFixed(2)}M`:value>=1e3?`${(value/1e3).toFixed(1)}k`:String(Math.round(value)); }
function duration(value=0){ return !value?'—':value>=1000?`${(value/1000).toFixed(1)}s`:`${value}ms`; }
function time(value:string|null){ return value?new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'—'; }
function short(value:string|null){ return value?.slice(0,8) ?? '—'; }
function sessionComponent(session:MonitorSession|undefined,key:string){ return session?.componentShares.find((item)=>item.key===key)?.tokens ?? 0; }
function deltaPercent(baseline:number,candidate:number){ if(!baseline)return candidate?'新增':'—'; const value=(candidate-baseline)/baseline*100; return `${value>0?'+':''}${value.toFixed(1)}%`; }
async function load(){ if(loading.value)return; loading.value=true; error.value=''; try{data.value=await getGatewayMonitorSummary({range:range.value,limit:200}); const sessions=data.value.sessions; if(!candidateSessionId.value&&sessions[0])candidateSessionId.value=sessions[0].sessionId; if(!baselineSessionId.value&&sessions[1])baselineSessionId.value=sessions[1].sessionId;}catch(caught){error.value=caught instanceof Error?caught.message:'监控数据加载失败';}finally{loading.value=false;} }
function resetTimer(){ if(timer!==null)window.clearInterval(timer); timer=autoRefresh.value?window.setInterval(()=>void load(),15000):null; }
watch(range,()=>void load()); watch(autoRefresh,resetTimer);
onMounted(()=>{void load();resetTimer();}); onBeforeUnmount(()=>{if(timer!==null)window.clearInterval(timer);});
</script>

<template>
  <main class="admin-shell">
    <header class="admin-header"><div><p class="eyebrow">INTERNAL · GATEWAY OBSERVABILITY</p><h1>Token 用量控制台</h1><p>独立诊断页面，不出现在 Career Agent 的产品导航中。</p></div><RouterLink to="/">返回应用</RouterLink></header>
    <section class="toolbar">
      <select v-model="range" aria-label="统计范围"><option value="1h">1 小时</option><option value="24h">24 小时</option><option value="7d">7 天</option><option value="30d">30 天</option><option value="all">全部</option></select>
      <button @click="load">{{loading?'刷新中…':'刷新'}}</button><label><input v-model="autoRefresh" type="checkbox"> 15 秒自动刷新</label>
    </section>

    <article class="panel sessions-panel"><header><div><p class="eyebrow">SESSION EXPERIMENTS</p><h2>会话级实验</h2></div><small>每个会话包含完整 Agent / Skill / 重试循环</small></header>
      <div class="session-table"><div class="session-row table-head"><span>会话</span><span>时间</span><span>请求</span><span>成功 / 失败</span><span>实际 Token</span><span>尝试 Prompt</span><span>单次成功均值</span><span></span></div><div v-for="session in data?.sessions" :key="session.sessionId" class="session-row"><code :title="session.sessionId">{{short(session.sessionId)}}</code><span>{{time(session.lastAt)}}</span><span>{{session.requests}}</span><span>{{session.completed}} / <b :class="{failed:session.failed}">{{session.failed}}</b></span><strong>{{tokens(session.totalTokens)}}</strong><span>{{tokens(session.attemptedPromptTokens)}}</span><span>{{tokens(session.averageTokensPerCompletedRequest)}}</span><button class="small-button" @click="drilldownSessionId=session.sessionId">下钻</button></div></div><p v-if="!data?.sessions.length" class="empty">暂无会话。</p>
    </article>

    <article class="panel compare-panel"><header><div><p class="eyebrow">ABLATION</p><h2>会话消融比较</h2></div><small>变化率以基线为分母，负值表示节省</small></header>
      <div class="compare-selectors"><label>基线会话<select v-model="baselineSessionId"><option value="">请选择</option><option v-for="session in data?.sessions" :key="`base-${session.sessionId}`" :value="session.sessionId">{{short(session.sessionId)}} · {{tokens(session.totalTokens)}}</option></select></label><span>→</span><label>实验会话<select v-model="candidateSessionId"><option value="">请选择</option><option v-for="session in data?.sessions" :key="`candidate-${session.sessionId}`" :value="session.sessionId">{{short(session.sessionId)}} · {{tokens(session.totalTokens)}}</option></select></label></div>
      <div v-if="baselineSession&&candidateSession" class="comparison"><div class="comparison-row table-head"><span>指标</span><span>基线</span><span>实验</span><span>变化</span></div><div v-for="row in comparisonRows" :key="row[0]" class="comparison-row"><strong>{{row[0]}}</strong><span>{{tokens(row[1])}}</span><span>{{tokens(row[2])}}</span><b :class="{saving:row[2]<row[1],regression:row[2]>row[1]}">{{deltaPercent(row[1],row[2])}}</b></div></div><p v-else class="empty">至少需要两个会话才能比较。</p>
    </article>
    <p v-if="error" class="notice error">{{error}}</p><p v-else-if="data&&!data.enabled" class="notice">Gateway 探针尚未启用。</p>

    <section class="kpis">
      <article class="primary"><span>实际总 Token</span><strong>{{tokens(totals?.totalTokens)}}</strong><small>来自成功响应 usage</small></article>
      <article><span>实际 Prompt</span><strong>{{tokens(totals?.promptTokens)}}</strong><small>{{totals?.completed??0}} 次成功</small></article>
      <article><span>尝试发送 Prompt</span><strong>{{tokens(totals?.attemptedPromptTokens)}}</strong><small>包括失败请求估算</small></article>
      <article class="danger"><span>失败请求负载</span><strong>{{tokens(totals?.failedAttemptedPromptTokens)}}</strong><small>{{totals?.failed??0}} 次失败</small></article>
      <article><span>缓存命中</span><strong>{{(totals?.cacheHitRate??0).toFixed(1)}}%</strong><small>{{tokens(totals?.cachedTokens)}} cached</small></article>
      <article><span>平均延迟</span><strong>{{duration(totals?.averageDurationMs)}}</strong><small>{{totals?.requests??0}} 次尝试</small></article>
    </section>

    <section class="grid">
      <article class="panel"><header><div><p class="eyebrow">BILLED COMPOSITION</p><h2>成功请求输入成分</h2></div><small>失败估算不混入占比</small></header>
        <div v-if="data?.componentShares.length" class="composition"><div class="donut" :style="donut"><div><strong>{{tokens(totals?.promptTokens)}}</strong><span>Prompt</span></div></div><div class="legend"><div v-for="item in data.componentShares" :key="item.key"><i :style="{background:color(item.key)}"></i><span>{{label(item.key)}}</span><strong>{{item.percentage.toFixed(1)}}%</strong><small>{{tokens(item.tokens)}}</small></div></div></div><p v-else class="empty">成功请求产生后显示占比。</p>
      </article>
      <article class="panel"><header><div><p class="eyebrow">BILLED TREND</p><h2>实际 Token 趋势</h2></div></header><div v-if="data?.trend.length" class="trend"><div v-for="item in data.trend" :key="item.bucket" :title="`${time(item.bucket)} · ${tokens(item.totalTokens)}`"><i :style="{height:`${Math.max(3,item.totalTokens/maxTrend*100)}%`}"></i><span>{{time(item.bucket)}}</span></div></div><p v-else class="empty">当前范围暂无数据。</p></article>
    </section>

    <article class="panel"><header><div><p class="eyebrow">SCHEMA PRESSURE</p><h2>成功请求工具 Schema 热点</h2></div></header><div class="tools"><div v-for="item in data?.toolSchemas.slice(0,15)" :key="item.name"><code>{{item.name}}</code><span><i :style="{width:`${item.tokens/maxTool*100}%`}"></i></span><strong>{{tokens(item.tokens)}}</strong><small>{{item.requests}} 次</small></div></div><p v-if="!data?.toolSchemas.length" class="empty">暂无数据。</p></article>

    <article class="panel"><header><div><p class="eyebrow">REQUEST DRILLDOWN</p><h2>会话内逐请求分析</h2></div><div class="drilldown"><small>{{visibleRequests.length}} 条</small><button v-if="drilldownSessionId" class="small-button" @click="drilldownSessionId=''">查看全部</button></div></header>
      <div class="requests"><details v-for="request in visibleRequests" :key="request.requestId"><summary><strong>{{tokens(request.totalTokens||request.estimatedPromptTokens)}}</strong><b :style="{color:color(request.dominantCause)}">{{label(request.dominantCause)}}</b><span :class="{failed:request.outcome!=='completed'}">{{request.outcome}}</span><code>{{short(request.requestId)}}</code><small>{{request.model}} · {{time(request.timestamp)}} · {{duration(request.durationMs)}}</small></summary><div class="details"><p>会话 {{request.sessionId}} · 实际 Prompt {{tokens(request.promptTokens)}} · 估算发送 {{tokens(request.estimatedPromptTokens)}} · Completion {{tokens(request.completionTokens)}} · {{request.messageCount}} 条消息 · {{request.toolDefinitionCount}} 个工具</p><div v-for="item in request.components.filter((component)=>component.estimatedTokens>0)" :key="item.key" class="component"><span>{{label(item.key)}}</span><div><i :style="{width:`${item.percentage}%`,background:color(item.key)}"></i></div><strong>{{item.percentage.toFixed(1)}}%</strong><small>{{tokens(request.promptTokens?item.calibratedTokens:item.estimatedTokens)}}</small></div><p v-if="request.largestToolDefinitions.length" class="chips"><code v-for="tool in request.largestToolDefinitions.slice(0,8)" :key="tool.name">{{tool.name}} {{tokens(tool.estimatedTokens)}}</code></p></div></details></div><p v-if="!visibleRequests.length" class="empty">暂无请求。</p>
    </article>
  </main>
</template>

<style scoped>
.admin-shell{min-height:100vh;padding:28px clamp(18px,4vw,56px) 48px;background:#f3f5f4;color:#17211f;font-family:Inter,"Noto Sans SC",sans-serif}.admin-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;max-width:1500px;margin:0 auto 18px}.admin-header h1{margin:4px 0;font-size:clamp(1.65rem,3vw,2.4rem)}.admin-header p{margin:0;color:#66706e}.admin-header a{padding:9px 13px;border:1px solid #ccd4d1;border-radius:10px;color:#315f58;text-decoration:none;background:white}.eyebrow{font-size:.68rem!important;font-weight:800;letter-spacing:.13em;color:#648078!important}.toolbar,.kpis,.grid,.panel,.notice{max-width:1500px;margin-left:auto;margin-right:auto}.toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:14px;padding:12px 14px;border:1px solid #d8dedc;border-radius:14px;background:white}.toolbar input:not([type=checkbox]){min-width:min(380px,60vw);flex:1}.toolbar label{font-size:.78rem;color:#66706e}select,input,button{min-height:38px;border:1px solid #ccd4d1;border-radius:9px;padding:0 11px;background:white;color:inherit;font:inherit}button{border-color:#315f58;background:#315f58;color:white;font-weight:700;cursor:pointer}.notice{padding:12px;border-radius:10px;background:#fff6dc}.notice.error{color:#9a312b;background:#fbe9e7}.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:12px}.kpis article,.panel{border:1px solid #d8dedc;border-radius:15px;background:white;box-shadow:0 5px 20px #1c292512}.kpis article{display:grid;gap:6px;padding:15px}.kpis span,.kpis small{font-size:.7rem;color:#66706e}.kpis strong{font-size:1.55rem}.kpis .primary{background:#315f58;color:white}.kpis .primary span,.kpis .primary small{color:#d7e5e1}.kpis .danger strong{color:#a13c35}.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:12px;margin-bottom:12px}.panel{padding:18px;margin-bottom:12px;min-width:0}.panel>header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}.panel h2{margin:2px 0 0;font-size:1rem}.panel header small{color:#66706e}.composition{display:grid;grid-template-columns:170px 1fr;align-items:center;gap:22px}.donut{width:160px;aspect-ratio:1;border-radius:50%;display:grid;place-items:center}.donut>div{width:100px;aspect-ratio:1;border-radius:50%;display:grid;place-content:center;text-align:center;background:white}.donut span{font-size:.68rem;color:#66706e}.legend{display:grid;gap:9px}.legend>div{display:grid;grid-template-columns:10px 1fr 50px 62px;gap:8px;font-size:.76rem}.legend i{width:9px;height:9px;border-radius:50%}.legend strong,.legend small{text-align:right}.legend small{color:#66706e}.trend{height:220px;display:flex;align-items:flex-end;gap:6px;border-bottom:1px solid #d8dedc;overflow-x:auto}.trend>div{height:100%;flex:1 0 28px;display:flex;flex-direction:column;justify-content:flex-end;gap:5px}.trend i{display:block;min-height:3px;border-radius:5px 5px 0 0;background:#315f58}.trend span{height:32px;overflow:hidden;font-size:.58rem;color:#66706e;writing-mode:vertical-rl}.tools{display:grid;gap:8px}.tools>div{display:grid;grid-template-columns:minmax(140px,.8fr) minmax(120px,2fr) 65px 55px;gap:10px;align-items:center;font-size:.74rem}.tools>div>span,.component>div{height:8px;border-radius:99px;background:#edf0ef;overflow:hidden}.tools i,.component i{display:block;height:100%;background:#5f8f86}.tools strong,.tools small{text-align:right}.requests{display:grid;gap:8px}.requests details{border:1px solid #d8dedc;border-radius:11px;overflow:hidden}.requests summary{display:grid;grid-template-columns:78px 120px 80px 75px 1fr;gap:9px;align-items:center;padding:12px;cursor:pointer}.requests summary b,.requests summary span{font-size:.7rem}.requests summary .failed{color:#a13c35}.requests summary small{text-align:right;color:#66706e}.details{padding:14px;border-top:1px solid #d8dedc}.details>p{font-size:.74rem;color:#66706e}.component{display:grid;grid-template-columns:140px 1fr 50px 65px;gap:9px;align-items:center;margin:7px 0;font-size:.72rem}.component strong,.component small{text-align:right}.chips{display:flex;gap:6px;flex-wrap:wrap}.chips code{padding:5px;background:#edf0ef;border-radius:7px}.empty{text-align:center;color:#66706e;padding:28px}code{font-family:Consolas,monospace;overflow:hidden;text-overflow:ellipsis}
.session-table{overflow-x:auto}.session-row{display:grid;grid-template-columns:110px 120px 60px 95px 100px 110px 115px 65px;gap:12px;align-items:center;min-width:900px;padding:10px;border-top:1px solid #e4e8e6;font-size:.75rem}.session-row.table-head{border-top:0;background:#f4f6f5;color:#66706e;font-weight:700}.session-row .failed{color:#a13c35}.small-button{min-height:30px;padding:0 9px;font-size:.7rem}.compare-selectors{display:flex;align-items:flex-end;justify-content:center;gap:14px;padding:4px 0 18px}.compare-selectors label{display:grid;gap:6px;font-size:.72rem;color:#66706e}.compare-selectors select{min-width:220px}.comparison{max-width:760px;margin:auto}.comparison-row{display:grid;grid-template-columns:1fr 130px 130px 100px;gap:12px;padding:10px 12px;border-top:1px solid #e4e8e6;text-align:right;font-size:.78rem}.comparison-row>*:first-child{text-align:left}.comparison-row.table-head{border:0;background:#f4f6f5;color:#66706e}.saving{color:#237353}.regression{color:#a13c35}.drilldown{display:flex;align-items:center;gap:9px}
@media(max-width:1100px){.kpis{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}}@media(max-width:720px){.admin-header{align-items:flex-end}.kpis{grid-template-columns:repeat(2,1fr)}.composition{grid-template-columns:1fr;justify-items:center}.legend{width:100%}.requests summary{grid-template-columns:70px 1fr 70px}.requests summary code,.requests summary small{display:none}.component{grid-template-columns:105px 1fr 45px}.component small{display:none}}
</style>
