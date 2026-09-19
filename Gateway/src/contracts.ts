/** Versioned wire contracts. Credentials must never appear in these objects. */
export const SCHEMA_VERSION = '1.0' as const;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export interface WorkspaceFile {
  /** Portable path relative to the future workspace root. */
  path: string;
  encoding: 'utf8' | 'base64';
  content: string;
}

export interface CreateRunRequest {
  taskId: string;
  profile: JsonObject;
  query: string;
  workspace: { files: WorkspaceFile[] };
  /** Server-side configuration name, not a model API key or URL. */
  modelProfile: string;
  userSimulator: { modelProfile: string } | null;
  limits: { timeoutMs: number; maxModelCalls: number; maxUserQuestions: number };
}

export interface RunPolicy {
  conversationMemory: false;
  captureAgentRole: 'main';
  /** All other backend capabilities retain their existing configuration. */
  otherBackendFeatures: 'inherit';
}

export type RunStatus = 'created' | 'preparing' | 'running' | 'waiting_user'
  | 'completed' | 'failed' | 'cancelled' | 'timed_out';

export interface HarnessBinding {
  userId: number;
  conversationId: string;
  workspaceRoot: string;
}

export interface RunRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  taskId: string;
  /** runId is also the rolloutId: each sampling attempt has a new runId. */
  runId: string;
  gatewaySessionId: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  policy: RunPolicy;
  harness: HarnessBinding | null;
  input: CreateRunRequest;
  execution: { available: boolean; reason: 'harness_not_configured' | null };
  initialFiles: Array<{ path: string; bytes: number; sha256: string }>;
  error: string | null;
  reply: string | null;
  cleanup: 'not_requested' | 'pending' | 'completed' | 'failed';
  pendingQuestion: JsonObject | null;
}

export interface CallIdentity {
  runId: string;
  gatewaySessionId: string;
  requestId: string;
  /** Logical model call; retries have distinct requestId and attempt values. */
  modelCallId: string;
  attempt: number;
  agentId: string;
  parentAgentId: string | null;
  agentRole: 'main' | 'subagent' | 'auxiliary' | 'user_simulator';
  purpose: 'policy' | 'skill' | 'profile' | 'compaction' | 'user_simulation' | 'other';
}

export type TrajectoryPayload =
  | { type: 'model.request'; identity: CallIdentity; protocol: 'openai' | 'anthropic'; body: JsonObject }
  | { type: 'model.response'; identity: CallIdentity; protocol: 'openai' | 'anthropic'; status: number; rawBody?: string; complete: boolean }
  | { type: 'training.tokens'; requestId: string; tokens: TrainingTokens }
  | { type: 'tool.call'; agentId: string; toolUseId: string; name: string; input: JsonObject }
  | { type: 'tool.result'; agentId: string; toolUseId: string; content: Json; isError: boolean }
  | { type: 'run.finished'; status: 'completed' | 'failed' | 'cancelled' | 'timed_out'; reason: string | null };

/** Phase-five ingress contract. run.finished is reserved for Gateway finalization. */
export interface TrajectoryEventInput {
  schemaVersion: typeof SCHEMA_VERSION;
  eventId: string;
  runId: string;
  occurredAt: string;
  payload: TrajectoryPayload;
}

export interface StoredTrajectoryEvent extends TrajectoryEventInput {
  /** Gateway-assigned per-run sequence, not a producer clock ordering. */
  sequence: number;
  receivedAt: string;
}

export interface UserQuestionRequest {
  runId: string;
  toolUseId: string;
  profile: JsonObject;
  query: string;
  visibleHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  questions: Array<{
    question: string;
    header: string;
    multiSelect: boolean;
    options: Array<{ label: string; description: string }>;
  }>;
}

export interface UserQuestionResponse {
  runId: string;
  toolUseId: string;
  answers: Record<string, string>;
}

/** Token data must come from the training inference adapter, never estimated. */
export interface TrainingTokens {
  source: 'inference_engine';
  modelVersion: string;
  tokenizerVersion: string;
  tokenIds: number[];
  /** Prefix context (including observations) is masked out; generated suffix has loss=1. */
  promptTokenCount: number;
  lossMask: Array<0 | 1>;
  logprobs: Array<number | null>;
}
