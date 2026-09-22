import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const publicRoot = path.join(here, "public");
const traceRoot = path.join(repoRoot, "trajectory_gen", "trajectories", "syn-tasks", "runs");
const syntheticRoot = path.join(repoRoot, "syn_tasks");
const port = Number(process.argv[process.argv.indexOf("--port") + 1] || process.env.PORT || 8790);

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function optionalJson(file, fallback = {}) {
  try { return await json(file); } catch { return fallback; }
}

async function directories(root) {
  try {
    return (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function locatePackage(scenarioId) {
  for (const first of await directories(syntheticRoot)) {
    const firstPath = path.join(syntheticRoot, first);
    const candidates = [path.join(firstPath, "packages", scenarioId)];
    for (const second of await directories(firstPath)) {
      candidates.push(path.join(firstPath, second, "packages", scenarioId));
    }
    for (const candidate of candidates) {
      try {
        if ((await stat(path.join(candidate, "task.json"))).isFile()) return candidate;
      } catch {}
    }
  }
  return null;
}

function fileBySuffix(files, suffix) {
  return files.find((file) => file.endsWith(suffix));
}

function parseTool(message) {
  try {
    return JSON.parse(message.content);
  } catch {
    return { name: "unparseable", arguments: message.content };
  }
}

function decodeContent(content) {
  try { return JSON.parse(content); } catch { return content; }
}

function toolName(definition) {
  return definition?.function?.name || definition?.name || null;
}

function messageContentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text").map((block) => block.text || "").join("\n");
}

function toolInventory(eventsDocument) {
  const events = eventsDocument.events || [];
  const requests = events.filter((event) => event.payload?.type === "model.request");
  const definitionsByRequest = requests.map((event) => {
    let definitions = event.payload?.body?.tools || [];
    if (typeof definitions === "string") {
      try { definitions = JSON.parse(definitions); } catch { definitions = []; }
    }
    return Array.isArray(definitions) ? definitions : [];
  });
  const initial = [...new Set((definitionsByRequest[0] || []).map(toolName).filter(Boolean))];
  const initialSet = new Set(initial);
  const capturedSchemas = [...new Set(definitionsByRequest.flat().map(toolName).filter(Boolean))];
  const deferred = new Set();
  for (const request of requests) {
    for (const message of request.payload?.body?.messages || []) {
      const text = messageContentText(message?.content);
      for (const match of text.matchAll(/<available-deferred-tools>\s*([\s\S]*?)\s*<\/available-deferred-tools>/g)) {
        for (const name of match[1].split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) deferred.add(name);
      }
    }
  }
  const loaded = new Set(capturedSchemas.filter((name) => !initialSet.has(name)));
  for (const event of events.filter((item) => item.payload?.type === "tool.result")) {
    let content = event.payload?.content;
    if (typeof content === "string") { try { content = JSON.parse(content); } catch { content = null; } }
    if (!Array.isArray(content)) continue;
    for (const block of content) if (block?.type === "tool_reference" && block.tool_name) loaded.add(block.tool_name);
  }
  const actualCounts = {};
  for (const event of events.filter((item) => item.payload?.type === "tool.call")) {
    const name = event.payload?.name;
    if (name) actualCounts[name] = (actualCounts[name] || 0) + 1;
  }
  return {
    initial,
    deferred: [...deferred].sort(),
    dynamicallyLoaded: [...loaded].sort(),
    actuallyCalled: Object.entries(actualCounts).map(([name, count]) => ({ name, count })),
    capturedSchemas,
  };
}

function inspectTrace(eventsDocument, qwen, summary) {
  const events = eventsDocument.events || [];
  const calls = events.filter((event) => event.payload?.type === "tool.call");
  const results = events.filter((event) => event.payload?.type === "tool.result");
  const requests = events.filter((event) => event.payload?.type === "model.request");
  const responses = events.filter((event) => event.payload?.type === "model.response");
  const resultIds = new Set(results.map((event) => event.payload.toolUseId));
  const responseIds = new Set(responses.map((event) => event.payload.identity?.requestId));
  const identities = [...new Set(events.map((event) => event.payload?.identity?.agentRole || (event.payload?.agentId?.split(":")[0])).filter(Boolean))];
  const purposes = [...new Set(events.map((event) => event.payload?.identity?.purpose).filter(Boolean))];
  const ordered = events.every((event, index) => index === 0 || Date.parse(events[index - 1].occurredAt) <= Date.parse(event.occurredAt));
  const toolPairsComplete = calls.every((event) => resultIds.has(event.payload.toolUseId)) && calls.length === results.length;
  const modelPairsComplete = requests.every((event) => responseIds.has(event.payload.identity?.requestId)) && requests.length === responses.length;
  const qwenMessages = Array.isArray(qwen.messages) ? qwen.messages : [];
  const reasoningCount = qwenMessages.filter((message) => message.role === "assistant" && /<think>[\s\S]*?<\/think>/.test(String(message.content))).length;
  const controlPlanePatterns = [/schema was not sent/i, /client-side parser/i, /discovered-tool set/i, /Tool loaded\./i];
  const leakEvidence = qwenMessages.flatMap((message, index) => {
    const content = String(decodeContent(message.content));
    return controlPlanePatterns.some((pattern) => pattern.test(content))
      ? [{ index, role: message.role, excerpt: content.slice(0, 220) }]
      : [];
  });
  const injectedUserMarkers = qwenMessages.filter((message, index) => index > 1 && message.role === "user" && String(message.content).trim() === "Tool loaded.").length;
  const toolErrorCount = results.filter((event) => event.payload.isError).length;
  const toolNames = calls.reduce((counts, event) => {
    counts[event.payload.name] = (counts[event.payload.name] || 0) + 1;
    return counts;
  }, {});
  return {
    verdict: toolPairsComplete && modelPairsComplete && ordered && identities.every((role) => role === "main") ? "complete" : "review",
    modelPairs: { requests: requests.length, responses: responses.length, complete: modelPairsComplete },
    toolPairs: { calls: calls.length, results: results.length, complete: toolPairsComplete },
    time: { ordered, firstUtc: events[0]?.occurredAt, lastUtc: events.at(-1)?.occurredAt },
    isolation: {
      mainAgentOnly: identities.every((role) => role === "main"),
      roles: identities,
      purposes,
      nestedExecutionCaptured: false,
      controlPlaneLeak: leakEvidence.length > 0,
      leakEvidence,
      note: leakEvidence.length
        ? "No nested tool execution was captured, but framework/schema control-plane details appear in observations."
        : "Tool artifacts contain only call arguments and returned observations; no nested tool execution events were captured."
    },
    planSft: {
      sftReady: qwen.sftReady,
      trainingReady: qwen.trainingReady,
      reasoningCount,
      injectedUserMarkers,
      toolErrorCount,
      strictReady: qwen.sftReady && summary.semanticAudit?.accepted !== false && reasoningCount === 0 && injectedUserMarkers === 0 && leakEvidence.length === 0,
      semanticAudit: summary.semanticAudit ?? null,
      recommendation: reasoningCount || injectedUserMarkers || leakEvidence.length
        ? "For strict Plan-only training: remove <think>, injected Tool loaded user markers, and control-plane diagnostics."
        : "The message sequence is suitable for a strict tool-selection target."
    },
    toolNames
  };
}

function count(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function messageText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === "string" ? part : JSON.stringify(part ?? ""))).join("");
  return content === undefined || content === null ? "" : JSON.stringify(content);
}

// The provider only reports a single prompt_tokens figure per call, so the
// per-bucket split below is a character-proportional estimate of that total.
function contextComposition(call) {
  const request = call?.request ?? {};
  const buckets = new Map();
  const add = (label, text) => buckets.set(label, (buckets.get(label) || 0) + String(text ?? "").length);
  const tools = request.tools;
  if (Array.isArray(tools) && tools.length) add("tools", JSON.stringify(tools));
  else if (typeof tools === "string" && tools) add("tools", tools);
  const roles = { system: "system", user: "user", assistant: "assistant", tool: "tool", tool_response: "tool" };
  for (const message of request.messages ?? []) add(roles[message?.role] || "other", messageText(message));
  const chars = [...buckets.values()].reduce((sum, value) => sum + value, 0);
  const promptTokens = count(call?.usage?.prompt_tokens);
  return [...buckets.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([role, size]) => ({ role, chars: size, share: chars ? size / chars : 0, estTokens: chars ? Math.round((size / chars) * promptTokens) : 0 }));
}

function tokenStats(callsDocument) {
  const calls = Array.isArray(callsDocument?.calls) ? callsDocument.calls : [];
  const perCall = calls.map((call, index) => ({
    index,
    call: index + 1,
    sequence: call?.requestSequence ?? null,
    model: call?.request?.model ?? null,
    messages: Array.isArray(call?.request?.messages) ? call.request.messages.length : 0,
    prompt: count(call?.usage?.prompt_tokens),
    completion: count(call?.usage?.completion_tokens),
    reasoning: count(call?.usage?.completion_tokens_details?.reasoning_tokens),
    total: count(call?.usage?.total_tokens),
  }));
  const sum = (key) => perCall.reduce((total, item) => total + item[key], 0);
  const prompts = perCall.map((item) => item.prompt);
  return {
    available: perCall.length > 0,
    tokenSource: callsDocument?.tokenSource ?? null,
    trainingReady: Boolean(callsDocument?.trainingReady),
    reasons: callsDocument?.reasons ?? [],
    perCall,
    callCount: perCall.length,
    firstPrompt: prompts[0] ?? 0,
    finalPrompt: prompts.at(-1) ?? 0,
    maxPrompt: prompts.length ? Math.max(...prompts) : 0,
    sumPrompt: sum("prompt"),
    sumCompletion: sum("completion"),
    sumReasoning: sum("reasoning"),
    sumTotal: sum("total"),
    growth: prompts.map((value, index) => (index === 0 ? 0 : value - prompts[index - 1])),
    composition: perCall.length ? contextComposition(calls.at(-1)) : [],
  };
}

function planSteps(messages) {
  let toolIndex = 0;
  return messages.map((message, index) => {
    if (message.role === "tool_call") {
      const tool = parseTool(message);
      return { index, kind: "plan", role: message.role, title: `Call ${tool.name}`, content: tool.arguments, pair: toolIndex++ };
    }
    if (message.role === "tool_response") {
      return { index, kind: "observation", role: message.role, title: "Tool output", content: decodeContent(message.content), pair: Math.max(0, toolIndex - 1) };
    }
    const content = String(message.content ?? "");
    const reasoning = [...content.matchAll(/<think>([\s\S]*?)<\/think>/g)].map((match) => match[1].trim()).join("\n\n");
    const visible = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return { index, kind: message.role === "assistant" ? "planner_text" : message.role, role: message.role, title: message.role, content: visible, reasoning };
  });
}

async function listRuns() {
  const output = [];
  for (const scenarioId of await directories(traceRoot)) {
    const runDir = path.join(traceRoot, scenarioId);
    const files = await readdir(runDir);
    if (!files.includes("run.json") || !files.includes("summary.json")) continue;
    const [run, summary] = await Promise.all([json(path.join(runDir, "run.json")), json(path.join(runDir, "summary.json"))]);
    if (!files.includes(`${summary.runId}.events.json`) || !files.includes(`${summary.runId}.qwen3_5_sft.json`)) continue;
    const packageDir = await locatePackage(scenarioId);
    const task = packageDir ? await json(path.join(packageDir, "task.json")) : null;
    output.push({ id: scenarioId, scenarioId, storagePath: path.relative(repoRoot, runDir).replaceAll("\\", "/"), runId: run.runId, taskId: run.taskId, status: run.status, createdAt: run.createdAt, title: task?.title || run.taskId, summary });
  }
  return output.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

async function runDetail(id) {
  const scenarioId = id;
  if (!/^[\w.-]+$/.test(scenarioId || "")) return null;
  const runDir = path.join(traceRoot, scenarioId);
  const files = await readdir(runDir);
  const summary = await optionalJson(path.join(runDir, "summary.json"));
  const runId = summary.runId;
  const qwenFile = `${runId}.qwen3_5_sft.json`;
  const eventsFile = `${runId}.events.json`;
  const callsFile = `${runId}.calls.json`;
  if (!runId || !files.includes(qwenFile) || !files.includes(eventsFile)) return null;
  const [run, qwen, events, calls, artifacts] = await Promise.all([
    json(path.join(runDir, "run.json")), json(path.join(runDir, qwenFile)), json(path.join(runDir, eventsFile)),
    optionalJson(path.join(runDir, callsFile), null), optionalJson(path.join(runDir, "artifacts.json"), { artifacts: [] })
  ]);
  const packageDir = await locatePackage(scenarioId);
  let source = null;
  if (packageDir) {
    const [task, persona, environment, materials] = await Promise.all([
      json(path.join(packageDir, "task.json")), json(path.join(packageDir, "persona.json")), json(path.join(packageDir, "environment.json")), json(path.join(packageDir, "materials_manifest.json"))
    ]);
    source = { relativePath: path.relative(repoRoot, packageDir), task, persona, environment, materials };
  }
  return { id, scenarioId, storagePath: path.relative(repoRoot, runDir).replaceAll("\\", "/"), run, summary, source, artifacts, audit: inspectTrace(events, qwen, summary), tokens: tokenStats(calls), steps: planSteps(Array.isArray(qwen.messages) ? qwen.messages : []), toolInventory: toolInventory(events), tools: qwen.tools, qwenMeta: { format: qwen.format, sftReady: qwen.sftReady, trainingReady: qwen.trainingReady, reasons: qwen.reasons } };
}

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  response.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/api/runs") return send(response, 200, { runs: await listRuns() });
    if (url.pathname === "/api/run") {
      const detail = await runDetail(url.searchParams.get("id") || "");
      return detail ? send(response, 200, detail) : send(response, 404, { error: "Run not found" });
    }
    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.resolve(publicRoot, requested);
    if (!file.startsWith(publicRoot + path.sep) && file !== path.join(publicRoot, "index.html")) return send(response, 403, "Forbidden", "text/plain");
    send(response, 200, await readFile(file), mime[path.extname(file)] || "application/octet-stream");
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Plan Trace Inspector: http://127.0.0.1:${port}`));
