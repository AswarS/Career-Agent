const state = { run: null, task: null, timezone: "UTC", showReasoning: false, filter: "all", view: "trace", searchTimer: null };
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const pretty = (value) => typeof value === "string" ? value : JSON.stringify(value, null, 2);

function formatTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: state.timezone, dateStyle: "medium", timeStyle: "medium", hour12: false }).format(new Date(value));
}

function badge(text, ok = true) { return `<span class="badge ${ok ? "ok" : "warn"}">${esc(text)}</span>`; }

const num = (value) => Number(value || 0).toLocaleString("en-US");
const signed = (value) => `${value > 0 ? "+" : value < 0 ? "-" : ""}${num(Math.abs(value))}`;

function bar(value, max) {
  return `<span class="token-bar"><i style="width:${max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0}%"></i></span>`;
}

function renderTokens() {
  const host = $("#tokens");
  const tokens = state.run.tokens;
  if (!tokens?.available) {
    host.innerHTML = '<p class="note">该轨迹没有 calls.json，无法统计上下文 token。</p>';
    return;
  }
  const maxPrompt = Math.max(tokens.maxPrompt, 1);
  const rows = tokens.perCall.map((call) => `
    <tr>
      <td>#${call.call}</td>
      <td title="${esc(call.model || "")}">${num(call.prompt)}</td>
      <td>${signed(tokens.growth[call.index])}</td>
      <td>${num(call.completion)}</td>
      <td>${num(call.total)}</td>
    </tr>
    <tr class="token-foot"><td colspan="5">${bar(call.prompt, maxPrompt)}<span class="token-bar-label">${call.messages} 条消息 · 上下文 ${num(call.prompt)} tok</span></td></tr>`).join("");
  const composition = tokens.composition.map((item) => `
    <div class="token-role"><span>${esc(item.role)}</span>${bar(item.share * 100, 100)}<strong>${num(item.estTokens)}</strong><small>${(item.share * 100).toFixed(1)}%</small></div>`).join("");
  host.innerHTML = `
    <div class="audit-row"><span>模型调用轮次</span><strong>${num(tokens.callCount)}</strong></div>
    <div class="audit-row"><span>首轮 / 末轮上下文</span><strong>${num(tokens.firstPrompt)} → ${num(tokens.finalPrompt)}</strong></div>
    <div class="audit-row"><span>峰值上下文</span><strong>${num(tokens.maxPrompt)} tok</strong></div>
    <div class="audit-row"><span>累计输入 / 输出</span><strong>${num(tokens.sumPrompt)} / ${num(tokens.sumCompletion)}</strong></div>
    <div class="audit-row"><span>推理 token</span><strong>${num(tokens.sumReasoning)}</strong></div>
    <div class="audit-row"><span>累计计费 token</span><strong>${num(tokens.sumTotal)}</strong></div>
    <h3>每轮上下文</h3>
    <table class="token-table"><thead><tr><th>轮次</th><th>上下文</th><th>增量</th><th>输出</th><th>合计</th></tr></thead><tbody>${rows}</tbody></table>
    <h3>末轮上下文构成（按字符估算）</h3>
    <div class="token-roles">${composition || '<span class="muted">无</span>'}</div>
    <p class="note">以上为 API 返回的 token 用量统计，不参与合成成功判定。</p>`;
}

function renderAudit() {
  const a = state.run.audit;
  $("#audit").innerHTML = `
    <div class="audit-row"><span>模型请求 / 响应</span><strong>${a.modelPairs.requests} / ${a.modelPairs.responses}</strong>${badge(a.modelPairs.complete ? "配对完整" : "缺失", a.modelPairs.complete)}</div>
    <div class="audit-row"><span>工具调用 / 输出</span><strong>${a.toolPairs.calls} / ${a.toolPairs.results}</strong>${badge(a.toolPairs.complete ? "配对完整" : "缺失", a.toolPairs.complete)}</div>
    <div class="audit-row"><span>时间顺序</span><strong>${a.time.ordered ? "单调" : "异常"}</strong>${badge(a.time.ordered ? "通过" : "检查", a.time.ordered)}</div>
    <div class="audit-row"><span>捕获边界</span><strong>${a.isolation.roles.join(", ")}</strong>${badge(a.isolation.mainAgentOnly ? "仅主规划器" : "混入其他代理", a.isolation.mainAgentOnly)}</div>
    <div class="audit-row"><span>Tool 嵌套执行</span><strong>${a.isolation.nestedExecutionCaptured ? "检测到" : "未捕获"}</strong>${badge(a.isolation.nestedExecutionCaptured ? "泄露" : "黑盒", !a.isolation.nestedExecutionCaptured)}</div>
    <div class="audit-row"><span>控制面细节</span><strong>${a.isolation.leakEvidence.length} 处</strong>${badge(a.isolation.controlPlaneLeak ? "需清洗" : "未检测到", !a.isolation.controlPlaneLeak)}</div>
    <div class="audit-row"><span>显式 &lt;think&gt;</span><strong>${a.planSft.reasoningCount} 条</strong>${badge(a.planSft.reasoningCount ? "Plan-only 建议剔除" : "无", !a.planSft.reasoningCount)}</div>
    <div class="audit-row"><span>注入 user 标记</span><strong>${a.planSft.injectedUserMarkers} 条</strong>${badge(a.planSft.injectedUserMarkers ? "需清洗" : "无", !a.planSft.injectedUserMarkers)}</div>
    <div class="audit-row"><span>Tool 错误输出</span><strong>${a.planSft.toolErrorCount} 条</strong>${badge(a.planSft.toolErrorCount ? "复核质量" : "无", !a.planSft.toolErrorCount)}</div>
    ${a.planSft.semanticAudit ? `<div class="audit-row"><span>隐藏工具验收</span><strong>${a.planSft.semanticAudit.matchedCallCount} / ${a.planSft.semanticAudit.expectedCallCount}</strong>${badge(a.planSft.semanticAudit.accepted ? "通过" : `缺失 ${a.planSft.semanticAudit.missingCallCount}`, a.planSft.semanticAudit.accepted)}</div>` : ""}
    <p class="note">${esc(a.isolation.note)}</p><p class="note">${esc(a.planSft.recommendation)}</p>
    ${a.isolation.leakEvidence.length ? `<h3>污染证据</h3>${a.isolation.leakEvidence.map((item) => `<button class="evidence" data-step="${item.index}">#${item.index} ${esc(item.role)} · ${esc(item.excerpt)}</button>`).join("")}` : ""}
    <h3>时间范围</h3><dl><dt>UTC</dt><dd>${esc(a.time.firstUtc)}<br>${esc(a.time.lastUtc)}</dd><dt>${state.timezone}</dt><dd>${esc(formatTime(a.time.firstUtc))}<br>${esc(formatTime(a.time.lastUtc))}</dd></dl>
    <h3>工具分布</h3><div class="tool-grid">${Object.entries(a.toolNames).map(([name, count]) => `<span>${esc(name)} <strong>${count}</strong></span>`).join("")}</div>`;
  document.querySelectorAll(".evidence").forEach((button) => button.addEventListener("click", () => selectStep(Number(button.dataset.step))));
}

function renderToolInventory() {
  const inventory = state.run.toolInventory || {};
  const group = (title, tools, extra = "") => `
    <div class="tool-group"><h3>${esc(title)}</h3><div class="tool-grid">${(tools || []).map((tool) => {
      const name = typeof tool === "string" ? tool : tool.name;
      const suffix = typeof tool === "object" && tool.count ? ` <strong>${tool.count}</strong>` : "";
      return `<span>${esc(name)}${suffix}</span>`;
    }).join("") || '<span class="muted">None</span>'}</div>${extra}</div>`;
  const captured = new Set(inventory.capturedSchemas || []);
  const loadedWithoutSchema = (inventory.dynamicallyLoaded || []).filter((name) => !captured.has(name));
  $("#tool-inventory").innerHTML = [
    group("Initial schemas", inventory.initial),
    group("Deferred names", inventory.deferred),
    group("Dynamically loaded", inventory.dynamicallyLoaded, loadedWithoutSchema.length ? `<p class="note bad-note">${loadedWithoutSchema.length} loaded tool(s) have no captured schema.</p>` : ""),
    group("Actually called", inventory.actuallyCalled),
  ].join("");
}

function renderSource() {
  const { source, run, scenarioId } = state.run;
  const task = source?.task;
  $("#source-meta").innerHTML = `<dt>scenario_id</dt><dd>${esc(scenarioId)}</dd><dt>task_id</dt><dd>${esc(run.taskId)}</dd><dt>轨迹目录</dt><dd>${esc(state.run.storagePath)}</dd><dt>任务源路径</dt><dd>${esc(source?.relativePath || "未匹配")}</dd><dt>运行时间</dt><dd>${esc(formatTime(run.createdAt))}</dd>`;
  $("#task-text").textContent = task?.task || "未找到配套任务";
  $("#persona").textContent = pretty(source?.persona?.base_profile || {});
  const materials = source?.materials?.materials || [];
  $("#materials").innerHTML = materials.map((item) => `<div class="material"><strong>${esc(item.title || item.package_path || item.material_id)}</strong><span>${esc(item.package_path || item.logical_path || "")}</span><span>${esc(item.sha256 || item.media_type || "")}</span></div>`).join("") || '<span class="muted">无</span>';
  const artifacts = state.run.artifacts?.artifacts || [];
  $("#artifacts").innerHTML = artifacts.map((item) => `<div class="material"><strong>${esc(item.path)}</strong><span>${esc(item.change)} · ${esc(item.bytes)} bytes · ${esc(item.source)}</span></div>`).join("") || '<span class="muted">无生成文件</span>';
}

function stepVisible(step) {
  if (state.filter === "all") return true;
  if (state.filter === "context") return !["plan", "observation"].includes(step.kind);
  return step.kind === state.filter;
}

function renderTimeline() {
  const steps = state.run.steps.filter(stepVisible);
  $("#timeline").innerHTML = steps.length ? steps.map((step) => {
    const hasReasoning = state.showReasoning && step.reasoning;
    const preview = pretty(step.content).slice(0, 220);
    return `<button class="step ${esc(step.kind)}" data-index="${step.index}"><span class="step-index">${String(step.index).padStart(2, "0")}</span><span class="step-body"><span class="step-label">${esc(step.title)}</span><span class="step-preview">${esc(preview || "(empty)")}</span>${hasReasoning ? `<span class="reasoning-preview">THINK ${esc(step.reasoning.slice(0, 160))}</span>` : ""}</span></button>`;
  }).join("") : '<p class="note">该轨迹没有可展示的模型或工具事件。</p>';
  document.querySelectorAll(".step").forEach((button) => button.addEventListener("click", () => selectStep(Number(button.dataset.index))));
}

function selectStep(index) {
  const step = state.run.steps.find((item) => item.index === index);
  document.querySelectorAll(".step").forEach((node) => node.classList.toggle("selected", Number(node.dataset.index) === index));
  $("#detail-empty").hidden = true; $("#detail").hidden = false;
  $("#detail-title").textContent = `${String(step.index).padStart(2, "0")} · ${step.title}`;
  $("#detail-content").textContent = `${step.reasoning && state.showReasoning ? `PLANNER REASONING\n${step.reasoning}\n\n` : ""}${pretty(step.content)}`;
}

async function loadRun(id) {
  $("#run-state").textContent = "读取中";
  state.run = await fetch(`/api/run?id=${encodeURIComponent(id)}`).then((response) => response.json());
  $("#run-state").textContent = state.run.run.status;
  $("#title").textContent = state.run.source?.task?.title || state.run.run.taskId;
  $("#subtitle").textContent = `${state.run.scenarioId} · ${state.run.run.runId}`;
  const a = state.run.audit;
  $("#badges").innerHTML = badge(state.run.summary.sftReady ? "已过质检" : "未过质检", state.run.summary.sftReady)
    + (!state.run.summary.sftReady && state.run.summary.retained ? badge("已保留·不入训练", false) : "")
    + badge(a.verdict === "complete" ? "链路完整" : "需要检查", a.verdict === "complete")
    + badge(a.isolation.controlPlaneLeak ? "控制面污染" : "Tool 黑盒", !a.isolation.controlPlaneLeak)
    + badge(a.planSft.strictReady ? "Plan Ready" : "Plan 需清洗", a.planSft.strictReady)
    + (state.run.stepSource === "events" ? badge("Events 回退视图", false) : "");
  renderSource(); renderTokens(); renderAudit(); renderToolInventory(); renderTimeline();
}

function setView(view) {
  state.view = view;
  const taskMode = view === "task";
  $("#trace-view").hidden = taskMode;
  $("#task-view").hidden = !taskMode;
  $("#trace-toolbar").hidden = taskMode;
  $("#run-state").hidden = taskMode;
  $("#trace-tab").classList.toggle("active", !taskMode);
  $("#task-tab").classList.toggle("active", taskMode);
}

function renderStringList(host, values, empty = "无") {
  host.innerHTML = values?.length ? `<ul class="check-list">${values.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : `<span class="muted">${esc(empty)}</span>`;
}

function auditBlock(title, audit) {
  if (!audit) return `<section class="audit-card"><strong>${esc(title)}</strong><span class="muted">未提供</span></section>`;
  const checks = (audit.checks || []).map((check) => `<li><span>${esc(check.check || check.component || "检查项")}</span>${badge(check.status || "unknown", check.status === "passed")}</li>`).join("");
  return `<section class="audit-card"><div><strong>${esc(title)}</strong>${badge(audit.status || "available", audit.status === "passed")}</div>${checks ? `<ul>${checks}</ul>` : `<pre>${esc(pretty(audit))}</pre>`}</section>`;
}

function bindingSummary(binding) {
  const source = binding.source || "unknown";
  const target = binding.material_id || binding.invocation_id || (binding.value === undefined ? "" : pretty(binding.value));
  return `${binding.input_field || "input"} ← ${source}${target ? ` · ${target}` : ""}`;
}

function renderTaskDetail(detail) {
  state.task = detail;
  $("#task-empty").hidden = true;
  $("#task-detail").hidden = false;
  $("#task-side-empty").hidden = true;
  $("#task-side-detail").hidden = false;
  const task = detail.task || {};
  $("#task-title").textContent = task.title || task.id || detail.scenarioId || "未命名任务";
  $("#task-subtitle").textContent = `${detail.scenarioId || task.scenario_id || "本地任务"} · ${detail.dataset || "本地文件"}`;
  $("#task-badges").innerHTML = badge(detail.audits?.validation?.status === "passed" ? "静态校验通过" : "静态校验待查", detail.audits?.validation?.status === "passed")
    + badge(`${detail.invocations?.length || 0} 步工具链`, true)
    + badge(`${detail.materials?.length || 0} 份材料`, true)
    + (detail.runAvailable ? '<button id="open-task-run" class="inline-action" type="button">查看已有轨迹</button>' : "");
  $("#inspect-task-text").textContent = task.task || "未提供 task 字段";
  renderStringList($("#task-deliverables"), task.deliverables || []);
  renderStringList($("#task-criteria"), task.acceptance_criteria || []);
  renderStringList($("#task-constraints"), task.constraints || []);
  $("#task-tool-chain").innerHTML = detail.invocations?.length
    ? detail.invocations.map((item, index) => `${index ? '<i aria-hidden="true">→</i>' : ""}<span>${esc(item.toolName || item.invocationId)}</span>`).join("")
    : '<span class="muted">未提供 invocation_bindings.json</span>';
  $("#task-invocations").innerHTML = (detail.invocations || []).map((item) => `
    <details class="invocation"><summary><b>${item.index}</b><strong>${esc(item.toolName || item.invocationId)}</strong><span>${esc(item.invocationId || "")}</span></summary>
      <ul>${(item.inputBindings || []).map((binding) => `<li>${esc(bindingSummary(binding))}</li>`).join("") || '<li class="muted">无显式输入绑定</li>'}</ul>
    </details>`).join("");
  $("#task-materials").innerHTML = (detail.materials || []).map((material) => `
    <details class="material-detail"><summary><strong>${esc(material.title || material.material_id || material.package_path)}</strong><span>${esc(material.package_path || material.logical_path || "")}</span></summary>
      <p>${esc(material.purpose || "")}</p><pre>${esc(material.content ?? "未选择或无法读取材料正文")}</pre>
    </details>`).join("") || '<span class="muted">无输入材料</span>';
  const profile = detail.persona?.base_profile || detail.persona?.product_fields || detail.persona || {};
  $("#inspect-persona").textContent = pretty(profile);
  $("#inspect-environment").textContent = pretty(detail.environment || {});
  $("#inspect-task-meta").innerHTML = `<dt>task_id</dt><dd>${esc(task.id || "-")}</dd><dt>scenario_id</dt><dd>${esc(detail.scenarioId || task.scenario_id || "-")}</dd><dt>任务集</dt><dd>${esc(detail.dataset || "本地文件")}</dd><dt>路径</dt><dd>${esc(detail.relativePath || "浏览器本地选择")}</dd><dt>Schema</dt><dd>${esc(task.schema_version || "-")}</dd>`;
  $("#inspect-audits").innerHTML = auditBlock("环境校验", detail.audits?.validation)
    + auditBlock("任务—工具对齐", detail.audits?.taskToolAlignment)
    + auditBlock("材料绑定", detail.audits?.materialBinding);
  $("#open-task-run")?.addEventListener("click", async () => {
    const id = detail.scenarioId || task.scenario_id;
    if (!id) return;
    setView("trace");
    $("#run-select").value = id;
    await loadRun(id);
  });
}

async function loadTask(dataset, scenarioId) {
  $("#task-results").classList.add("loading");
  try {
    const response = await fetch(`/api/task?dataset=${encodeURIComponent(dataset)}&id=${encodeURIComponent(scenarioId)}`);
    if (!response.ok) throw new Error((await response.json()).error || "Task not found");
    renderTaskDetail(await response.json());
  } catch (error) {
    $("#task-results").innerHTML = `<p class="note bad-note">读取任务失败：${esc(error.message)}</p>`;
  } finally {
    $("#task-results").classList.remove("loading");
  }
}

async function searchTaskCatalog() {
  const query = $("#task-search").value.trim();
  const dataset = $("#dataset-select").value;
  $("#task-results").innerHTML = '<p class="empty">搜索中…</p>';
  const response = await fetch(`/api/tasks/search?q=${encodeURIComponent(query)}&dataset=${encodeURIComponent(dataset)}`);
  const data = await response.json();
  $("#task-results").innerHTML = data.tasks?.length ? data.tasks.map((task) => `
    <button class="task-result" data-dataset="${esc(task.dataset)}" data-id="${esc(task.scenarioId)}" type="button">
      <strong>${esc(task.title)}</strong><span>${esc(task.scenarioId)}</span><small>${esc(task.task)}</small>
    </button>`).join("") : '<p class="empty">没有匹配任务。可以换关键词或直接选择任务包目录。</p>';
  document.querySelectorAll(".task-result").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".task-result").forEach((item) => item.classList.toggle("selected", item === button));
    loadTask(button.dataset.dataset, button.dataset.id);
  }));
}

function fileByEnding(files, ending) {
  const normalizedEnding = ending.replaceAll("\\", "/").toLowerCase();
  return files.find((file) => (file.webkitRelativePath || file.name).replaceAll("\\", "/").toLowerCase().endsWith(normalizedEnding));
}

async function readLocalJson(files, ending, fallback) {
  const file = fileByEnding(files, ending);
  if (!file) return fallback;
  return JSON.parse(await file.text());
}

async function loadLocalTaskFiles(fileList) {
  const files = [...fileList];
  const taskFiles = files.filter((file) => /(^|\/)task\.json$/i.test((file.webkitRelativePath || file.name).replaceAll("\\", "/")));
  if (taskFiles.length !== 1) {
    $("#task-results").innerHTML = `<p class="note bad-note">需要且只能找到一个 task.json；当前找到 ${taskFiles.length} 个。请选择单个任务包目录。</p>`;
    return;
  }
  try {
    const [task, persona, environment, bindings, manifest, requirements, validation, alignment, materialBinding] = await Promise.all([
      readLocalJson(files, "task.json", {}), readLocalJson(files, "persona.json", {}), readLocalJson(files, "environment.json", {}),
      readLocalJson(files, "invocation_bindings.json", { invocations: [] }), readLocalJson(files, "materials_manifest.json", { materials: [] }),
      readLocalJson(files, "material_requirements.json", { requirements: [] }), readLocalJson(files, "metadata/validation_report.json", null),
      readLocalJson(files, "metadata/task_tool_alignment_audit.json", null), readLocalJson(files, "metadata/material_binding_audit.json", null),
    ]);
    const materials = await Promise.all((manifest.materials || []).map(async (material) => {
      const source = fileByEnding(files, material.package_path || "");
      return { ...material, content: source ? await source.text() : null };
    }));
    renderTaskDetail({
      dataset: "本地文件", scenarioId: task.scenario_id || taskFiles[0].webkitRelativePath.split("/").at(-2) || "local",
      relativePath: taskFiles[0].webkitRelativePath || taskFiles[0].name, runAvailable: false, task, persona, environment, materials,
      requirements: requirements.requirements || [], audits: { validation, taskToolAlignment: alignment, materialBinding },
      invocations: (bindings.invocations || []).map((item, index) => ({ index: index + 1, invocationId: item.invocation_id, toolId: item.tool_id, toolName: item.tool_name, inputBindings: item.input_bindings || [] })),
    });
    $("#task-results").innerHTML = `<p class="note">已从浏览器本地读取：${esc(taskFiles[0].webkitRelativePath || taskFiles[0].name)}</p>`;
  } catch (error) {
    $("#task-results").innerHTML = `<p class="note bad-note">本地文件解析失败：${esc(error.message)}</p>`;
  }
}

async function initTaskInspector() {
  const data = await fetch("/api/task-datasets").then((response) => response.json());
  $("#dataset-select").innerHTML = '<option value="">全部任务集</option>' + data.datasets.map((dataset) => `<option value="${esc(dataset.name)}">${esc(dataset.name)} (${num(dataset.count)})</option>`).join("");
  $("#task-count").textContent = `${num(data.datasets.reduce((sum, item) => sum + item.count, 0))} 条`;
}

async function init() {
  const [data] = await Promise.all([fetch("/api/runs").then((response) => response.json()), initTaskInspector()]);
  $("#run-select").innerHTML = data.runs.map((run) => `<option value="${esc(run.id)}">[${run.summary.sftReady ? "质检通过" : run.summary.retained ? "未过质检·已保留" : "未过质检"}] [${esc(run.status)}] ${esc(run.title)} · ${esc(run.taskId)}</option>`).join("");
  if (data.runs[0]) await loadRun(data.runs[0].id); else $("#run-state").textContent = "没有轨迹";
}

$("#run-select").addEventListener("change", (event) => loadRun(event.target.value));
$("#timezone").addEventListener("click", () => { state.timezone = state.timezone === "UTC" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"; $("#timezone").textContent = state.timezone === "UTC" ? "UTC" : "本地"; renderSource(); renderAudit(); });
$("#reasoning").addEventListener("click", () => { state.showReasoning = !state.showReasoning; $("#reasoning").textContent = state.showReasoning ? "隐藏推理" : "显示推理"; renderTimeline(); });
$("#filters").addEventListener("click", (event) => { if (!event.target.dataset.kind) return; state.filter = event.target.dataset.kind; document.querySelectorAll("#filters button").forEach((button) => button.classList.toggle("active", button === event.target)); renderTimeline(); });
$("#trace-tab").addEventListener("click", () => setView("trace"));
$("#task-tab").addEventListener("click", () => setView("task"));
$("#task-search-button").addEventListener("click", searchTaskCatalog);
$("#task-search").addEventListener("input", () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(searchTaskCatalog, 260); });
$("#task-search").addEventListener("keydown", (event) => { if (event.key === "Enter") { clearTimeout(state.searchTimer); searchTaskCatalog(); } });
$("#dataset-select").addEventListener("change", searchTaskCatalog);
$("#task-folder-input").addEventListener("change", (event) => loadLocalTaskFiles(event.target.files));
$("#task-file-input").addEventListener("change", (event) => loadLocalTaskFiles(event.target.files));
init();
