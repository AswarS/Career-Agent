/**
 * Real Network E2E for the learning workflow.
 *
 * The conversation is intentionally written like normal user requests. It
 * does not name tools or describe the expected orchestration. The server uses
 * the selected user's stored model configuration and Profile, and the created thread is
 * retained for inspection in the frontend.
 *
 * Privacy: this runner prints only thread IDs, event/tool names, outcomes and
 * verification booleans. It never prints Profile data, prompts, answers,
 * model text, tool inputs/results, or artifact contents.
 */

import { createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { careerAgentDatabasePath } from "../src/Network/database.config.js";
import { careerAgentJwtSecret } from "../src/Network/security.config.js";
import { resolveArtifactForWorkspace } from "../src/artifacts/actionArtifactResolver.js";
import { learningStateService } from "../src/learning/learningStateService.js";
import { getNetworkUserWorkspaceDir } from "../src/Network/utils/networkTranscriptStorage.js";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4000";
const API = `${BASE_URL}/api/career-agent`;
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 60 * 60_000);
let authorization = "";
let internalUserId = "";

type JsonObject = Record<string, unknown>;

async function api(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<any> {
  const response = await fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  if (!response.ok) {
    throw new Error(
      `API ${options.method ?? "GET"} ${path} failed with ${response.status}`,
    );
  }
  return response.json();
}

function createLocalAuthorization(): string {
  const requestedUsername = process.env.E2E_USERNAME?.trim().toLowerCase() || "user1";
  const database = new Database(careerAgentDatabasePath, { readonly: true });
  try {
    const user = database
      .query<
        {
          id: number;
          publicUserId: string;
          email: string | null;
          username: string | null;
          displayName: string | null;
          tokenVersion: number;
        },
        [string, string, string]
      >(
        `SELECT id, publicUserId, email, username, displayName, tokenVersion
         FROM users
         WHERE lower(coalesce(username, '')) = ?
            OR (? = 'user1' AND (userId = '1' OR id = 1))
         ORDER BY CASE WHEN lower(coalesce(username, '')) = ? THEN 0 ELSE 1 END
         LIMIT 1`,
      )
      .get(requestedUsername, requestedUsername, requestedUsername);
    if (!user?.publicUserId)
      throw new Error(`${requestedUsername} account was not found`);
    internalUserId = String(user.id);
    const now = Math.floor(Date.now() / 1_000);
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
      "utf8",
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.publicUserId,
        ...(user.email ? { email: user.email } : {}),
        ...(user.username ? { username: user.username } : {}),
        ...(user.displayName ? { display_name: user.displayName } : {}),
        token_version: user.tokenVersion,
        typ: "access",
        iat: now,
        exp: now + 60 * 60,
      }),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", careerAgentJwtSecret())
      .update(`${header}.${payload}`)
      .digest("base64url");
    return `Bearer ${header}.${payload}.${signature}`;
  } finally {
    database.close();
  }
}

async function auditDemoThread(threadId: string): Promise<boolean> {
  const messages = await api(`/threads/${threadId}/messages`);
  const blocks = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === "assistant")
    .flatMap((message) => (Array.isArray(message.blocks) ? message.blocks : []));
  const toolByUseId = new Map<string, string>();
  const sequence: string[] = [];
  let mainErrors = 0;
  for (const block of blocks) {
    if (block?.type === "tool_call") {
      const name = String(block.name ?? "unknown");
      const useId = String(block.toolUseId ?? "");
      if (useId) toolByUseId.set(useId, name);
      sequence.push(`call:${name}`);
    } else if (block?.type === "tool_result") {
      const useId = String(block.toolUseId ?? "");
      const isError =
        block.isError === true ||
        block.is_error === true ||
        block.status === "error" ||
        block.status === "failed";
      if (isError) mainErrors += 1;
      sequence.push(
        `result:${toolByUseId.get(useId) ?? "unknown"}:${isError ? "error" : "ok"}`,
      );
    }
  }
  const artifacts = loadPersistedRunArtifacts(threadId);
  const subagent = await auditSubagentToolErrors(threadId);
  console.log(
    `Demo audit: mainErrors=${mainErrors} subagentErrors=${subagent.errors.length} artifacts=${artifacts.length}`,
  );
  console.log(`  sequence ${sequence.join(" -> ") || "none"}`);
  console.log(
    `  artifact types ${artifacts.map((artifact) => artifact.type).join(", ") || "none"}`,
  );
  for (const error of subagent.errors) {
    console.log(`  subagent error tool=${error.tool} category=${error.category}`);
  }
  return mainErrors === 0 && subagent.errors.length === 0;
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

async function auditSubagentToolErrors(threadId: string): Promise<{
  files: number;
  calls: number;
  errors: Array<{ tool: string; category: string }>;
}> {
  const directory = join(
    import.meta.dir,
    "../src/Network/user",
    internalUserId,
    "transcripts",
    threadId,
    "subagents",
  );
  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".jsonl"));
  } catch {
    return { files: 0, calls: 0, errors: [] };
  }
  let calls = 0;
  const errors: Array<{ tool: string; category: string }> = [];
  for (const name of names) {
    const toolByUseId = new Map<string, string>();
    const records = (await readFile(join(directory, name), "utf8"))
      .split("\n")
      .filter(Boolean);
    let invocationStart = 0;
    for (let index = 0; index < records.length; index += 1) {
      try {
        const parsed = asObject(JSON.parse(records[index]!));
        const content = asObject(parsed?.message)?.content;
        if (
          typeof content === "string" &&
          content.includes("<skill-action-input>") &&
          content.includes("skill_call_id")
        ) {
          invocationStart = index;
        }
      } catch {
        // Ignore malformed audit-only transcript records.
      }
    }
    for (const record of records.slice(invocationStart)) {
      let parsed: JsonObject | null = null;
      try {
        parsed = asObject(JSON.parse(record));
      } catch {
        continue;
      }
      const content = asObject(parsed?.message)?.content;
      if (!Array.isArray(content)) continue;
      for (const rawBlock of content) {
        const block = asObject(rawBlock);
        if (!block) continue;
        if (block.type === "tool_use") {
          const id = String(block.id ?? "");
          const tool = String(block.name ?? "unknown");
          if (id) toolByUseId.set(id, tool);
          calls += 1;
          continue;
        }
        if (block.type !== "tool_result" || block.is_error !== true) continue;
        const serialized =
          typeof block.content === "string"
            ? block.content
            : JSON.stringify(block.content ?? "");
        const category = /nested command interpreters/i.test(serialized)
          ? "nested-interpreter"
          : /outside[^\n]{0,80}workspace/i.test(serialized)
            ? "outside-workspace"
            : /permission|denied|not allowed/i.test(serialized)
              ? "permission"
              : /not found|ENOENT/i.test(serialized)
                ? "not-found"
                : /read it first before writing/i.test(serialized)
                  ? "write-before-read"
                  : "other";
        errors.push({
          tool: toolByUseId.get(String(block.tool_use_id ?? "")) ?? "unknown",
          category,
        });
      }
    }
  }
  return { files: names.length, calls, errors };
}

function toolData(payload: JsonObject | null): JsonObject | null {
  let current = payload;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const nested = asObject(current.data) ?? asObject(current.result);
    if (!nested) return current;
    current = nested;
  }
  return current;
}

function normalizeType(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function artifactRefFromMetadata(metadata: JsonObject): string | null {
  const uid = metadata.artifact_uid;
  return typeof uid === "string" && /^[0-9a-f-]{36}$/i.test(uid)
    ? `artifact://${uid.toLowerCase()}`
    : null;
}

function loadPersistedRunArtifacts(threadId: string): Array<{
  type: string;
  ref: string;
}> {
  const database = new Database(careerAgentDatabasePath, { readonly: true });
  try {
    const rows = database
      .query<
        {
          type: string | null;
          metadataJson: string | null;
        },
        [number, string]
      >(
        `SELECT type, metadataJson FROM artifacts
       WHERE userId = ? AND conversationId = ? ORDER BY createdAt ASC, id ASC`,
      )
      .all(Number(internalUserId), threadId);
    return rows.flatMap((row) => {
      if (!row.metadataJson) return [];
      try {
        const metadata = asObject(JSON.parse(row.metadataJson));
        const ref = metadata ? artifactRefFromMetadata(metadata) : null;
        return ref
          ? [{ type: String(row.type ?? metadata?.artifact_type ?? ""), ref }]
          : [];
      } catch {
        return [];
      }
    });
  } finally {
    database.close();
  }
}

function blocksFromEvent(event: JsonObject): JsonObject[] {
  const blocks: JsonObject[] = [];
  if (event.block && typeof event.block === "object") {
    blocks.push(event.block as JsonObject);
  }
  if (Array.isArray(event.blocks)) {
    blocks.push(
      ...event.blocks.filter((block): block is JsonObject =>
        Boolean(block && typeof block === "object"),
      ),
    );
  }
  return blocks;
}

function answerQuestion(question: string, options: JsonObject[]): string {
  const normalized = question.toLowerCase();
  if (/每周|weekly|per week/.test(normalized)) return "每周约 10 小时";
  if (/期限|多久|何时|deadline/.test(normalized)) return "六个月内";
  const recommended = options.find((option) =>
    /推荐|recommended/i.test(String(option.label ?? "")),
  );
  return String(recommended?.label ?? options[0]?.label ?? "按当前目标继续");
}

function safeErrorCode(block: JsonObject): string {
  const serialized = JSON.stringify(block);
  const explicitCode = serialized.match(
    /\b[A-Z][A-Z0-9_]{2,}\b(?=[:\\"])/,
  )?.[0];
  if (explicitCode) return explicitCode;
  if (/is not an Object/.test(serialized)) return "RUNTIME_TYPE_ERROR";
  if (/without calling ReturnSkillResult/i.test(serialized))
    return "SKILL_UNREPORTED";
  if (/ReturnSkillResult/i.test(serialized)) return "SKILL_RETURN_ERROR";
  if (/artifact[^.]*not found|not found[^.]*artifact/i.test(serialized))
    return "ARTIFACT_NOT_FOUND";
  if (/artifact[^.]*path|path[^.]*artifact/i.test(serialized))
    return "ARTIFACT_PATH_ERROR";
  if (/canonical/i.test(serialized) && /artifact/i.test(serialized))
    return "CANONICAL_ARTIFACT_ERROR";
  if (/publish|publication/i.test(serialized) && /artifact/i.test(serialized))
    return "ARTIFACT_PUBLICATION_ERROR";
  if (/invalid[^.]*artifact|artifact[^.]*invalid/i.test(serialized))
    return "INVALID_ARTIFACT";
  if (/artifact/i.test(serialized) && /failed|error/i.test(serialized))
    return "ARTIFACT_FAILURE";
  if (/permission|denied|not allowed/i.test(serialized))
    return "PERMISSION_DENIED";
  if (/validation|schema|expected/i.test(serialized)) return "VALIDATION_ERROR";
  if (/timed? ?out/i.test(serialized)) return "TIMEOUT";
  return "UNCLASSIFIED";
}

function parseToolPayload(block: JsonObject): JsonObject | null {
  const candidates: unknown[] = [
    block.content,
    block.result,
    block.output,
    block.text,
  ];
  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      return candidate as JsonObject;
    }
    if (typeof candidate !== "string") continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonObject;
      }
    } catch {
      // Persisted tool blocks may contain display text rather than JSON.
    }
  }
  return null;
}

function safeTechnicalMessage(block: JsonObject): string {
  const raw =
    typeof block.text === "string" ? block.text.split(/\r?\n/, 1)[0] : "";
  return raw
    .replace(/artifact:\/\/[0-9a-f-]{36}/gi, "artifact://[id]")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[id]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/(?:[A-Za-z]:)?[/\\][^\s]+/g, "[path]")
    .replace(/\{.*$/g, "[details]")
    .slice(0, 240);
}

async function answerAskUserQuestion(
  threadId: string,
  block: JsonObject,
): Promise<void> {
  const toolUseId =
    typeof block.toolUseId === "string" ? block.toolUseId : null;
  const questions = Array.isArray(block.questions) ? block.questions : [];
  if (!toolUseId || questions.length === 0) return;

  const answers: Record<string, string> = {};
  for (const candidate of questions) {
    if (!candidate || typeof candidate !== "object") continue;
    const question = String((candidate as JsonObject).question ?? "");
    if (!question) continue;
    const options = Array.isArray((candidate as JsonObject).options)
      ? ((candidate as JsonObject).options as unknown[]).filter(
          (option): option is JsonObject =>
            Boolean(option && typeof option === "object"),
        )
      : [];
    answers[question] = answerQuestion(question, options);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await api(`/threads/${threadId}/tool-responses/${toolUseId}`, {
        method: "POST",
        body: { approved: true, answers },
      });
      console.log("  AskUserQuestion answered");
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

async function sendMessage(threadId: string, content: string): Promise<void> {
  const response = await fetch(`${API}/threads/${threadId}/messages/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: JSON.stringify({ content }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`message stream failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const answered = new Set<string>();
  const deadline = Date.now() + TIMEOUT_MS;
  let buffer = "";
  let completed = false;

  while (true) {
    if (Date.now() > deadline) throw new Error("message stream timed out");
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("");
      if (!data) continue;
      let event: JsonObject;
      try {
        event = JSON.parse(data) as JsonObject;
      } catch {
        continue;
      }
      if (event.type === "error")
        throw new Error("stream emitted an error event");
      if (event.type === "skill.completed") {
        console.log(
          `  skill.completed ${String(event.skillName)} ${String(event.outcome)}`,
        );
      }
      if (event.type === "message.completed") completed = true;

      for (const block of blocksFromEvent(event)) {
        if (block.type !== "ask_question") continue;
        const id = typeof block.toolUseId === "string" ? block.toolUseId : "";
        if (!id || answered.has(id)) continue;
        answered.add(id);
        await answerAskUserQuestion(threadId, block);
      }
    }
  }
  if (!completed) throw new Error("message ended without message.completed");
}

async function verify(threadId: string): Promise<boolean> {
  const messages = await api(`/threads/${threadId}/messages`);
  const blocks = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === "assistant")
    .flatMap((message) =>
      Array.isArray(message.blocks) ? message.blocks : [],
    );
  const called = new Set(
    blocks
      .filter(
        (block) =>
          block?.type === "tool_call" && typeof block.name === "string",
      )
      .map((block) => block.name as string),
  );
  const toolNameByUseId = new Map<string, string>();
  for (const block of blocks) {
    if (
      block?.type === "tool_call" &&
      typeof block.toolUseId === "string" &&
      typeof block.name === "string"
    ) {
      toolNameByUseId.set(block.toolUseId, block.name);
    }
  }
  const artifactsResponse = await api("/artifacts");
  const artifacts = Array.isArray(artifactsResponse)
    ? artifactsResponse
    : (artifactsResponse?.artifacts ?? []);
  const runArtifacts = artifacts.filter(
    (artifact: any) => String(artifact.conversationId ?? "") === threadId,
  );
  const artifactTypes = new Set(
    runArtifacts.map((artifact: any) => artifact.type),
  );
  const criticalTools = new Set([
    "CareerCompetencyModel",
    "BaselineAssessment",
    "LearningPlan",
    "ActivateLearningPlan",
    "LearningStageDesign",
    "UpdateLearningProgress",
    "LearningProgressAssessment",
  ]);
  const toolResults = blocks.flatMap((block, index) => {
    if (block?.type !== "tool_result") return [];
    const useId = typeof block.toolUseId === "string" ? block.toolUseId : "";
    const name = toolNameByUseId.get(useId) ?? "unknown";
    const payload = parseToolPayload(block);
    return [{ block, index, useId, name, payload, data: toolData(payload) }];
  });
  const criticalErrors = toolResults.filter(
    (item) =>
      item.block.isError === true ||
      item.block.is_error === true ||
      item.block.status === "error" ||
      item.block.status === "failed",
  );
  const mainReturnCalls = blocks.filter(
    (block) =>
      block?.type === "tool_call" && block.name === "ReturnSkillResult",
  );

  const persistedArtifacts = loadPersistedRunArtifacts(threadId);
  const artifactByType = new Map<string, { type: string; ref: string }>();
  for (const artifact of persistedArtifacts) {
    artifactByType.set(normalizeType(artifact.type), artifact);
  }
  const expectedArtifacts = [
    ["career-competency-model", "CareerCompetencyModel"],
    ["baseline-assessment", "BaselineAssessment"],
    ["learning-plan", "LearningPlan"],
    ["learning-stage-package", "LearningStagePackage"],
    ["learning-progress-assessment", "LearningProgressAssessment"],
  ] as const;
  const workspaceDir = getNetworkUserWorkspaceDir(internalUserId);
  const resolved = new Map<
    string,
    Awaited<ReturnType<typeof resolveArtifactForWorkspace>>
  >();
  const artifactResolutionFailures: string[] = [];
  for (const [publicType, canonicalType] of expectedArtifacts) {
    const persisted = artifactByType.get(normalizeType(publicType));
    if (!persisted) {
      artifactResolutionFailures.push(`${publicType}:missing`);
      continue;
    }
    try {
      resolved.set(
        canonicalType,
        await resolveArtifactForWorkspace({
          userId: internalUserId,
          workspaceDir,
          artifactRef: persisted.ref,
          expectedType: canonicalType,
          supportedSchemaVersions: ["1.0"],
        }),
      );
    } catch (error) {
      artifactResolutionFailures.push(
        `${publicType}:${error instanceof Error && "code" in error ? String((error as any).code) : "invalid"}`,
      );
    }
  }

  const planArtifact = asObject(resolved.get("LearningPlan")?.canonical);
  const plan = asObject(planArtifact?.plan);
  const stages = Array.isArray(plan?.stages) ? plan.stages : [];
  const stageArtifact = asObject(
    resolved.get("LearningStagePackage")?.canonical,
  );
  const stagePackage = asObject(stageArtifact?.package);
  const assessmentArtifact = asObject(
    resolved.get("LearningProgressAssessment")?.canonical,
  );
  const assessment = asObject(assessmentArtifact?.assessment);
  const planRef = resolved.get("LearningPlan")?.artifactRef;
  const stageRef = resolved.get("LearningStagePackage")?.artifactRef;
  const assessmentRef = resolved.get("LearningProgressAssessment")?.artifactRef;

  const state = await learningStateService.getUserState(workspaceDir);
  const focus = state.plans.find(
    (candidate) => candidate.plan_id === state.focus_plan_id,
  );
  const stateReferencesCurrentRun = Boolean(
    focus &&
    planRef &&
    stageRef &&
    assessmentRef &&
    focus.plan_ref === planRef &&
    focus.current_stage_package_ref === stageRef &&
    focus.latest_assessment_ref === assessmentRef,
  );
  const lineageConsistent = Boolean(
    planRef &&
    stageRef &&
    stagePackage?.plan_ref === planRef &&
    assessment?.plan_ref === planRef &&
    assessment?.stage_package_ref === stageRef &&
    stagePackage?.stage_id === assessment?.stage_id,
  );

  const calls = blocks.flatMap((block, index) =>
    block?.type === "tool_call"
      ? [
          {
            block,
            index,
            name: String(block.name ?? ""),
            useId: String(block.toolUseId ?? ""),
          },
        ]
      : [],
  );
  const firstCall = (name: string) => calls.find((call) => call.name === name);
  const firstResult = (name: string) =>
    toolResults.find((result) => result.name === name);
  const updates = toolResults.filter(
    (result) => result.name === "UpdateLearningProgress",
  );
  const updateFor = (operation: string) =>
    updates.find((result) => result.data?.operation === operation);
  const planCall = firstCall("LearningPlan");
  const activateCall = firstCall("ActivateLearningPlan");
  const stageCall = firstCall("LearningStageDesign");
  const progressCall = firstCall("LearningProgressAssessment");
  const prerequisiteOrderValid = Boolean(
    planCall &&
    firstResult("CareerCompetencyModel")?.index! < planCall.index &&
    firstResult("BaselineAssessment")?.index! < planCall.index &&
    activateCall &&
    firstResult("LearningPlan")?.index! < activateCall.index &&
    stageCall &&
    firstResult("ActivateLearningPlan")?.index! < stageCall.index &&
    updateFor("start_stage") &&
    firstResult("LearningStageDesign")?.index! <
      updateFor("start_stage")!.index &&
    progressCall &&
    updateFor("mark_ready_for_assessment") &&
    updateFor("mark_ready_for_assessment")!.index < progressCall.index &&
    updateFor("apply_assessment") &&
    firstResult("LearningProgressAssessment")?.index! <
      updateFor("apply_assessment")!.index,
  );

  const readiness = String(assessment?.readiness ?? "");
  const finalStateConsistent = Boolean(
    focus &&
    (readiness === "advance"
      ? focus.completed_stage_ids.includes(String(assessment?.stage_id ?? ""))
      : readiness === "continue"
        ? focus.current_stage_status === "in_progress"
        : ["revise", "uncertain"].includes(readiness)
          ? focus.current_stage_status === "ready_for_assessment"
          : false),
  );
  const actionDurations = toolResults.flatMap((result) => {
    const duration = result.payload?.duration_ms ?? result.data?.duration_ms;
    return criticalTools.has(result.name) && typeof duration === "number"
      ? [{ name: result.name, duration }]
      : [];
  });

  const checks = [
    ["CareerCompetencyModel selected", called.has("CareerCompetencyModel")],
    ["BaselineAssessment selected", called.has("BaselineAssessment")],
    ["LearningPlan selected", called.has("LearningPlan")],
    ["ActivateLearningPlan selected", called.has("ActivateLearningPlan")],
    ["LearningStageDesign selected", called.has("LearningStageDesign")],
    ["UpdateLearningProgress selected", called.has("UpdateLearningProgress")],
    [
      "LearningProgressAssessment selected",
      called.has("LearningProgressAssessment"),
    ],
    [
      "competency artifact visible",
      artifactTypes.has("career-competency-model"),
    ],
    ["baseline artifact visible", artifactTypes.has("baseline-assessment")],
    ["plan artifact visible", artifactTypes.has("learning-plan")],
    [
      "stage package artifact visible",
      artifactTypes.has("learning-stage-package"),
    ],
    [
      "progress assessment artifact visible",
      artifactTypes.has("learning-progress-assessment"),
    ],
    ["no ToolResult errors", criticalErrors.length === 0],
    ["main Agent never called ReturnSkillResult", mainReturnCalls.length === 0],
    [
      "all canonical artifacts resolve and validate",
      artifactResolutionFailures.length === 0,
    ],
    ["learning plan has stages", stages.length > 0],
    ["stage and assessment lineage is consistent", lineageConsistent],
    [
      "learning state references current-run artifacts",
      stateReferencesCurrentRun,
    ],
    ["workflow prerequisites occurred in order", prerequisiteOrderValid],
    ["final state matches assessment readiness", finalStateConsistent],
  ] as const;

  let passed = true;
  console.log("Verification:");
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) passed = false;
  }
  console.log(`  observed tools: ${[...called].sort().join(", ")}`);
  if (artifactResolutionFailures.length) {
    console.log(
      `  artifact audit failures: ${artifactResolutionFailures.join(", ")}`,
    );
  }
  if (actionDurations.length) {
    console.log("  Action durations:");
    for (const item of actionDurations) {
      console.log(`    ${item.name}: ${(item.duration / 1_000).toFixed(1)}s`);
    }
  }
  console.log("  persisted tool sequence:");
  for (const block of blocks) {
    if (block?.type === "tool_call") {
      console.log(
        `    call ${String(block.name ?? "unknown")} status=${String(block.status ?? "unknown")}`,
      );
    } else if (block?.type === "tool_result") {
      const useId = typeof block.toolUseId === "string" ? block.toolUseId : "";
      const payload = parseToolPayload(block);
      const artifact =
        payload?.artifact && typeof payload.artifact === "object"
          ? (payload.artifact as JsonObject)
          : null;
      console.log(
        `    result ${toolNameByUseId.get(useId) ?? "unknown"} status=${String(block.status ?? "unknown")} error=${String(block.isError ?? block.is_error ?? false)}${block.isError || block.is_error ? ` code=${safeErrorCode(block)} detail=${safeTechnicalMessage(block)}` : ""}${typeof payload?.outcome === "string" ? ` outcome=${payload.outcome}` : ""}${typeof artifact?.status === "string" ? ` artifact=${artifact.status}` : ""}${typeof artifact?.error === "string" ? ` artifact_code=${safeErrorCode({ error: artifact.error })} artifact_detail=${safeTechnicalMessage({ text: artifact.error })}` : ""} fields=${Object.keys(block).sort().join(",")}`,
      );
    }
  }
  return passed;
}

async function verifyExecution(threadId: string): Promise<boolean> {
  const messages = await api(`/threads/${threadId}/messages`);
  const blocks = (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === "assistant")
    .flatMap((message) =>
      Array.isArray(message.blocks) ? message.blocks : [],
    );
  const toolNameByUseId = new Map<string, string>();
  const calls = blocks.flatMap((block, index) => {
    if (block?.type !== "tool_call") return [];
    const name = String(block.name ?? "");
    const useId = String(block.toolUseId ?? "");
    if (useId) toolNameByUseId.set(useId, name);
    return [{ name, useId, index }];
  });
  const results = blocks.flatMap((block, index) => {
    if (block?.type !== "tool_result") return [];
    const useId = String(block.toolUseId ?? "");
    const payload = parseToolPayload(block);
    return [
      {
        block,
        index,
        useId,
        name: toolNameByUseId.get(useId) ?? "unknown",
        payload,
        data: toolData(payload),
      },
    ];
  });
  const requiredTools = [
    "GetLearningState",
    "LearningStageDesign",
    "UpdateLearningProgress",
    "LearningProgressAssessment",
  ];
  const criticalErrors = results.filter(
    (item) =>
      item.block.isError === true ||
      item.block.is_error === true ||
      item.block.status === "error" ||
      item.block.status === "failed",
  );
  const subagentAudit = await auditSubagentToolErrors(threadId);
  const workspaceDir = getNetworkUserWorkspaceDir(internalUserId);
  const state = await learningStateService.getUserState(workspaceDir);
  const focus = state.plans.find(
    (candidate) => candidate.plan_id === state.focus_plan_id,
  );
  const persisted = loadPersistedRunArtifacts(threadId);
  const byType = new Map(
    persisted.map((artifact) => [normalizeType(artifact.type), artifact]),
  );
  const stageEntry = byType.get(normalizeType("learning-stage-package"));
  const assessmentEntry = byType.get(
    normalizeType("learning-progress-assessment"),
  );
  let planArtifact: Awaited<
    ReturnType<typeof resolveArtifactForWorkspace>
  > | null = null;
  let stageArtifact: Awaited<
    ReturnType<typeof resolveArtifactForWorkspace>
  > | null = null;
  let assessmentArtifact: Awaited<
    ReturnType<typeof resolveArtifactForWorkspace>
  > | null = null;
  const resolutionErrors: string[] = [];
  for (const [label, ref, type] of [
    ["plan", focus?.plan_ref, "LearningPlan"],
    ["stage", stageEntry?.ref, "LearningStagePackage"],
    ["assessment", assessmentEntry?.ref, "LearningProgressAssessment"],
  ] as const) {
    if (!ref) {
      resolutionErrors.push(`${label}:missing`);
      continue;
    }
    try {
      const value = await resolveArtifactForWorkspace({
        userId: internalUserId,
        workspaceDir,
        artifactRef: ref,
        expectedType: type,
        supportedSchemaVersions: ["1.0"],
      });
      if (label === "plan") planArtifact = value;
      else if (label === "stage") stageArtifact = value;
      else assessmentArtifact = value;
    } catch (error) {
      resolutionErrors.push(
        `${label}:${error instanceof Error && "code" in error ? String((error as any).code) : "invalid"}`,
      );
    }
  }
  const stage = asObject(asObject(stageArtifact?.canonical)?.package);
  const assessment = asObject(
    asObject(assessmentArtifact?.canonical)?.assessment,
  );
  const lineageValid = Boolean(
    focus &&
    planArtifact &&
    stageArtifact &&
    assessmentArtifact &&
    stage?.plan_id === focus.plan_id &&
    stage?.plan_ref === planArtifact.artifactRef &&
    assessment?.plan_id === focus.plan_id &&
    assessment?.plan_ref === planArtifact.artifactRef &&
    assessment?.stage_package_ref === stageArtifact.artifactRef &&
    assessment?.stage_id === stage?.stage_id,
  );
  const stateRefsValid = Boolean(
    focus &&
    stageArtifact &&
    assessmentArtifact &&
    focus.current_stage_package_ref === stageArtifact.artifactRef &&
    focus.latest_assessment_ref === assessmentArtifact.artifactRef,
  );
  const updates = results.filter(
    (result) => result.name === "UpdateLearningProgress",
  );
  const update = (operation: string) =>
    updates.find((result) => result.data?.operation === operation);
  const call = (name: string) => calls.find((item) => item.name === name);
  const result = (name: string) => results.find((item) => item.name === name);
  const orderValid = Boolean(
    result("GetLearningState") &&
    call("LearningStageDesign") &&
    result("GetLearningState")!.index < call("LearningStageDesign")!.index &&
    result("LearningStageDesign") &&
    update("start_stage") &&
    result("LearningStageDesign")!.index < update("start_stage")!.index &&
    update("mark_ready_for_assessment") &&
    call("LearningProgressAssessment") &&
    update("mark_ready_for_assessment")!.index <
      call("LearningProgressAssessment")!.index &&
    result("LearningProgressAssessment") &&
    update("apply_assessment") &&
    result("LearningProgressAssessment")!.index <
      update("apply_assessment")!.index,
  );
  const readiness = String(assessment?.readiness ?? "");
  const finalStateValid = Boolean(
    focus &&
    (readiness === "advance"
      ? focus.completed_stage_ids.includes(String(assessment?.stage_id ?? ""))
      : readiness === "continue"
        ? focus.current_stage_status === "in_progress"
        : ["revise", "uncertain"].includes(readiness)
          ? focus.current_stage_status === "ready_for_assessment"
          : false),
  );
  const artifactsResponse = await api("/artifacts");
  const publicArtifacts = Array.isArray(artifactsResponse)
    ? artifactsResponse
    : (artifactsResponse?.artifacts ?? []);
  const visibleTypes = new Set(
    publicArtifacts
      .filter(
        (artifact: any) => String(artifact.conversationId ?? "") === threadId,
      )
      .map((artifact: any) => artifact.type),
  );
  const checks: Array<readonly [string, boolean]> = [
    ...requiredTools.map(
      (name) =>
        [`${name} selected`, calls.some((item) => item.name === name)] as const,
    ),
    ["no ToolResult errors", criticalErrors.length === 0],
    ["no subagent ToolResult errors", subagentAudit.errors.length === 0],
    [
      "main Agent never called ReturnSkillResult",
      !calls.some((item) => item.name === "ReturnSkillResult"),
    ],
    [
      "stage package artifact visible",
      visibleTypes.has("learning-stage-package"),
    ],
    [
      "progress assessment artifact visible",
      visibleTypes.has("learning-progress-assessment"),
    ],
    ["canonical artifacts resolve and validate", resolutionErrors.length === 0],
    ["plan-stage-assessment lineage is consistent", lineageValid],
    ["learning state references current execution artifacts", stateRefsValid],
    ["workflow prerequisites occurred in order", orderValid],
    ["final state matches assessment readiness", finalStateValid],
  ];
  let passed = true;
  console.log("Execution verification:");
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) passed = false;
  }
  if (resolutionErrors.length) {
    console.log(`  artifact audit failures: ${resolutionErrors.join(", ")}`);
  }
  console.log(
    `  subagent audit: files=${subagentAudit.files} calls=${subagentAudit.calls} errors=${subagentAudit.errors.length}`,
  );
  for (const error of subagentAudit.errors) {
    console.log(`    subagent error tool=${error.tool} category=${error.category}`);
  }
  console.log("  persisted execution tool sequence:");
  for (const block of blocks) {
    if (block?.type === "tool_call") {
      console.log(`    call ${String(block.name ?? "unknown")}`);
    } else if (block?.type === "tool_result") {
      const useId = String(block.toolUseId ?? "");
      console.log(
        `    result ${toolNameByUseId.get(useId) ?? "unknown"} error=${String(block.isError ?? block.is_error ?? false)}${block.isError || block.is_error ? ` code=${safeErrorCode(block)}` : ""}`,
      );
    }
  }
  return passed;
}

async function main(): Promise<void> {
  authorization = createLocalAuthorization();
  const demoMessagesJson = process.env.E2E_DEMO_MESSAGES?.trim();
  if (demoMessagesJson) {
    const parsed = JSON.parse(demoMessagesJson) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("E2E_DEMO_MESSAGES must be a JSON string array");
    }
    const thread = await api("/threads", {
      method: "POST",
      body: { title: process.env.E2E_DEMO_TITLE?.trim() || "真实 E2E｜学习规划 Demo" },
    });
    const threadId = String(thread.id ?? thread.uuid);
    console.log(`Thread created: ${threadId}`);
    for (let index = 0; index < parsed.length; index += 1) {
      console.log(`Message ${index + 1}/${parsed.length} started`);
      await sendMessage(threadId, parsed[index]!);
      console.log(`Message ${index + 1}/${parsed.length} completed`);
    }
    const passed = await auditDemoThread(threadId);
    console.log(`Frontend thread retained: ${threadId}`);
    console.log(passed ? "DEMO TRAJECTORY CLEAN" : "DEMO TRAJECTORY NEEDS REVIEW");
    process.exitCode = passed ? 0 : 1;
    return;
  }
  const verifyExecutionThreadId =
    process.env.E2E_VERIFY_EXECUTION_THREAD_ID?.trim();
  if (verifyExecutionThreadId) {
    const passed = await verifyExecution(verifyExecutionThreadId);
    process.exitCode = passed ? 0 : 1;
    return;
  }
  const verifyThreadId = process.env.E2E_VERIFY_THREAD_ID?.trim();
  if (verifyThreadId) {
    const passed = await verify(verifyThreadId);
    process.exitCode = passed ? 0 : 1;
    return;
  }
  const continueThreadId = process.env.E2E_CONTINUE_THREAD_ID?.trim();
  if (continueThreadId) {
    await sendMessage(
      continueThreadId,
      "刚才的阶段评估结果没有成功同步到计划状态。请继续基于我已经提交的实现、测试、运行说明和失败案例记录完成评估，并把最终判断同步到当前计划。",
    );
    const passed = await verify(continueThreadId);
    console.log(`Frontend thread retained: ${continueThreadId}`);
    process.exitCode = passed ? 0 : 1;
    return;
  }
  if (process.env.E2E_EXECUTION_ONLY === "1") {
    const thread = await api("/threads", {
      method: "POST",
      body: { title: "真实 E2E｜计划执行闭环｜轨迹审计" },
    });
    const threadId = String(thread.id ?? thread.uuid);
    console.log(`Thread created: ${threadId}`);
    await sendMessage(
      threadId,
      "继续执行我当前已经确认并激活的学习计划。请把当前阶段整理成可以立刻开始的阶段安排，并同步到开始执行的状态。",
    );
    await sendMessage(
      threadId,
      "我完成了这个阶段安排的核心练习：实现了一个带多工具调用、状态持久化和失败重试的 Agent 流程，补了单元测试与运行说明，也记录了两次失败案例及修复原因。请根据这些已有证据判断我是否适合进入下一阶段，并同步当前计划进度。",
    );
    const passed = await verifyExecution(threadId);
    console.log(`Frontend thread retained: ${threadId}`);
    console.log(passed ? "EXECUTION E2E PASSED" : "EXECUTION E2E FAILED");
    process.exitCode = passed ? 0 : 1;
    return;
  }
  const thread = await api("/threads", {
    method: "POST",
    body: { title: "真实 E2E｜Agent 可靠性闭环｜轨迹审计" },
  });
  const threadId = String(thread.id ?? thread.uuid);
  console.log(`Thread created: ${threadId}`);

  await sendMessage(
    threadId,
    "我想把未来半年的方向进一步收窄到 LLM Agent 评测与可靠性工程，重点是评测体系、可观测性、记忆与多智能体编排。此前的通用 Agent 路线不够针对，请重新结合最新公开岗位要求和你已经了解的我的经历，形成一条可执行的提升路径。我每周大约能投入 10 小时。",
  );
  await sendMessage(
    threadId,
    "这个方向和计划我认可，就以它作为当前计划开始执行。请把第一个阶段整理成我可以立刻开始的阶段包，并把进度切到开始状态。",
  );
  await sendMessage(
    threadId,
    "我完成了第一阶段安排的核心练习：实现了一个带多工具调用、状态持久化和失败重试的 Agent 流程，补了单元测试与运行说明，也记录了两次失败案例及修复原因。请根据这些已有证据判断我是否适合进入下一阶段，并同步当前计划进度。",
  );

  const passed = await verify(threadId);
  console.log(`Frontend thread retained: ${threadId}`);
  console.log(passed ? "REAL E2E PASSED" : "REAL E2E FAILED");
  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown E2E failure");
  process.exit(1);
});
