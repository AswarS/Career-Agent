import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID, sign } from 'node:crypto';
import { Repository } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import {
  PRAXIS_TOOL_SCHEMA_VERSION,
  type PraxisReadClient,
  type PraxisReadContext,
  type PraxisReadInput,
} from './praxis.tools.js';
import {
  resolvePraxisReadIntegrationConfig,
  type PraxisReadIntegrationConfig,
} from './praxis-integration.config.js';
import {
  isPraxisReadErrorResponse,
  isPraxisReadResponse,
} from './praxis-read.contract.js';

type JsonObject = Record<string, unknown>;

type PraxisOpenTarget = {
  targetType: 'home' | 'project' | 'run' | 'node' | 'submission' | 'report';
  projectId?: string;
  runId?: string;
  nodeRunId?: string;
  submissionId?: string;
  reportId?: string;
};

type SubmissionReference = {
  submissionId: string;
  version: number;
  contentHash: string;
};

type StoredSelection = {
  selectionKey: string;
  target: PraxisOpenTarget;
  submissionRef?: SubmissionReference;
};

type BindingState = {
  selections: Map<string, StoredSelection>;
  current: Partial<Record<'project' | 'run' | 'submission' | 'report', string>>;
  turns: Map<string, PraxisReadInput['view'][]>;
};

type ProviderError = {
  code: string;
  message: string;
  retryable: boolean;
  traceId: string;
  retryAfter?: number;
};

export class PraxisReadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly traceId?: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'PraxisReadError';
  }
}

const MAX_BINDINGS = 1_000;
const MAX_SELECTIONS_PER_BINDING = 200;
const MAX_TURNS_PER_BINDING = 20;
const TOOL_CALL_ID = /^[A-Za-z0-9_-]{8,200}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SELECTION_KEY = /^sel_[A-Za-z0-9_-]{12,196}$/;
const HASH = /^[a-f0-9]{64}$/;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** RFC 8785 uses ECMAScript number/string serialization and UTF-16 key order. */
export function canonicalizePraxisJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('JCS does not support non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizePraxisJson).join(',')}]`;
  }
  if (isObject(value)) {
    const members = Object.keys(value)
      .sort()
      .map((key) => {
        const child = value[key];
        if (child === undefined)
          throw new Error('JCS does not support undefined');
        return `${JSON.stringify(key)}:${canonicalizePraxisJson(child)}`;
      });
    return `{${members.join(',')}}`;
  }
  throw new Error(`JCS does not support ${typeof value}`);
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createReadToken(
  config: PraxisReadIntegrationConfig,
  publicUserId: string,
  toolCallId: string,
  bodySha256: string,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encode({
    alg: config.algorithm,
    typ: 'JWT',
    kid: config.activeKid,
  });
  const payload = encode({
    iss: config.issuer,
    aud: config.audience,
    sub: publicUserId,
    jti: randomBytes(16).toString('base64url'),
    iat: issuedAt,
    exp: issuedAt + 60,
    contractVersion: PRAXIS_TOOL_SCHEMA_VERSION,
    method: 'POST',
    path: config.path,
    requestBodySha256: bodySha256,
    toolCallId,
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: config.privateKey,
    dsaEncoding: config.algorithm === 'ES256' ? 'ieee-p1363' : undefined,
  }).toString('base64url');
  return `${signingInput}.${signature}`;
}

function readProviderError(
  value: unknown,
  status: number,
  expectedToolCallId: string,
  retryAfterHeader: string | null,
): ProviderError {
  const error = isObject(value) && isObject(value.error) ? value.error : null;
  if (
    !isPraxisReadErrorResponse(value) ||
    !isObject(value) ||
    value.toolCallId !== expectedToolCallId ||
    typeof value.traceId !== 'string' ||
    !error
  ) {
    return {
      code: 'PROVIDER_RESPONSE_INVALID',
      message: 'Praxis returned an invalid error response.',
      retryable: false,
      traceId: 'trace_unavailable',
    };
  }
  const retryAfter =
    retryAfterHeader && /^\d+$/.test(retryAfterHeader)
      ? Number(retryAfterHeader)
      : undefined;
  const code = typeof error.code === 'string' ? error.code : 'REQUEST_INVALID';
  const expectedStatus: Record<string, number> = {
    REQUEST_INVALID: 400,
    TOKEN_INVALID: 401,
    TOKEN_EXPIRED: 401,
    SCOPE_DENIED: 403,
    RESOURCE_NOT_FOUND: 404,
    CONTEXT_STALE: 409,
    CONTRACT_VERSION_MISMATCH: 409,
    RATE_LIMITED: 429,
    SERVICE_UNAVAILABLE: 503,
  };
  if (
    expectedStatus[code] !== status ||
    (code === 'RATE_LIMITED' && retryAfter === undefined)
  ) {
    return {
      code: 'PROVIDER_RESPONSE_INVALID',
      message: 'Praxis returned an invalid error response.',
      retryable: false,
      traceId: value.traceId,
    };
  }
  return {
    code,
    message:
      typeof error.message === 'string' ? error.message : 'Praxis read failed.',
    retryable: error.retryable === true,
    traceId: value.traceId,
    retryAfter,
  };
}

function validateProviderResponse(
  value: unknown,
  input: PraxisReadInput,
  toolCallId: string,
  request: JsonObject,
): asserts value is JsonObject {
  const requestScope = isObject(request.scope) ? request.scope : {};
  const expectedScope =
    input.view === 'artifact_evidence' && isObject(request.submissionRef)
      ? { ...requestScope, submissionId: request.submissionRef.submissionId }
      : requestScope;
  if (
    !isPraxisReadResponse(value) ||
    !isObject(value) ||
    value.view !== input.view ||
    value.toolCallId !== toolCallId ||
    !isObject(value.scope) ||
    canonicalizePraxisJson(value.scope) !==
      canonicalizePraxisJson(expectedScope)
  ) {
    throw new PraxisReadError(
      'PROVIDER_RESPONSE_INVALID',
      'Praxis returned a response that does not match contract 1.0.0.',
      false,
    );
  }
}

function targetKind(target: PraxisOpenTarget) {
  if (target.targetType === 'report') return 'report' as const;
  if (target.submissionId) return 'submission' as const;
  if (target.runId) return 'run' as const;
  return 'project' as const;
}

function validTarget(value: unknown): value is PraxisOpenTarget {
  if (!isObject(value) || typeof value.targetType !== 'string') return false;
  return ['home', 'project', 'run', 'node', 'submission', 'report'].includes(
    value.targetType,
  );
}

function visitSelections(value: unknown, found: StoredSelection[]) {
  if (Array.isArray(value)) {
    for (const child of value) visitSelections(child, found);
    return;
  }
  if (!isObject(value)) return;
  if (
    typeof value.selectionKey === 'string' &&
    SELECTION_KEY.test(value.selectionKey) &&
    validTarget(value.openTarget)
  ) {
    found.push({ selectionKey: value.selectionKey, target: value.openTarget });
  }
  for (const child of Object.values(value)) visitSelections(child, found);
}

function submissionReference(value: unknown): SubmissionReference | undefined {
  if (
    !isObject(value) ||
    typeof value.submissionId !== 'string' ||
    !Number.isInteger(value.version) ||
    typeof value.contentHash !== 'string' ||
    !HASH.test(value.contentHash)
  )
    return undefined;
  return {
    submissionId: value.submissionId,
    version: value.version as number,
    contentHash: value.contentHash,
  };
}

@Injectable()
export class PraxisReadClientService implements PraxisReadClient {
  private readonly bindings = new Map<string, BindingState>();

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async read(
    input: PraxisReadInput,
    context: PraxisReadContext,
  ): Promise<unknown> {
    const config = this.resolveConfig();
    if (!config.enabled) {
      throw new ServiceUnavailableException(
        'Praxis read integration is disabled',
      );
    }
    if (!TOOL_CALL_ID.test(context.toolCallId)) {
      throw new PraxisReadError(
        'REQUEST_INVALID',
        'Invalid Praxis tool call ID.',
        false,
      );
    }
    const user = await this.userRepo.findOne({
      where: { id: Number(context.userId) },
    });
    if (
      !user ||
      user.accountStatus !== 'active' ||
      !UUID.test(user.publicUserId)
    ) {
      throw new PraxisReadError(
        'SCOPE_DENIED',
        'Active account is unavailable.',
        false,
      );
    }

    const state = this.binding(
      [
        user.publicUserId,
        context.conversationId,
        config.baseUrl,
        user.tokenVersion ?? 0,
        user.accountVersion ?? 0,
      ].join(':'),
    );
    this.consumeReadBudget(state, context.turnId, input.view);
    const request = this.buildRequest(input, context.toolCallId, state);
    const response = await this.send(
      request,
      input,
      user.publicUserId,
      config,
      context.signal,
    );
    this.rememberResponse(state, input, response);
    return response;
  }

  protected resolveConfig(): PraxisReadIntegrationConfig {
    return resolvePraxisReadIntegrationConfig();
  }

  protected performFetch(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, init);
  }

  private binding(key: string): BindingState {
    let state = this.bindings.get(key);
    if (!state) {
      state = { selections: new Map(), current: {}, turns: new Map() };
      this.bindings.set(key, state);
      if (this.bindings.size > MAX_BINDINGS) {
        this.bindings.delete(this.bindings.keys().next().value!);
      }
    }
    return state;
  }

  private consumeReadBudget(
    state: BindingState,
    turnId: string,
    view: PraxisReadInput['view'],
  ) {
    const previous = state.turns.get(turnId) ?? [];
    const allowedSecond =
      previous.length === 1 &&
      ((previous[0] === 'workspace_overview' && view === 'run_context') ||
        (previous[0] === 'submission_result' && view === 'artifact_evidence'));
    if (previous.length >= 1 && !allowedSecond) {
      throw new PraxisReadError(
        'READ_BUDGET_EXCEEDED',
        'Praxis read budget exceeded for this user turn.',
        false,
      );
    }
    state.turns.set(turnId, [...previous, view]);
    if (state.turns.size > MAX_TURNS_PER_BINDING) {
      state.turns.delete(state.turns.keys().next().value!);
    }
  }

  private select(
    state: BindingState,
    input: Exclude<PraxisReadInput, { view: 'workspace_overview' }>,
  ): StoredSelection {
    const kind =
      input.view === 'project_overview'
        ? 'project'
        : input.view === 'submission_result' ||
            input.view === 'artifact_evidence'
          ? 'submission'
          : input.view === 'run_report'
            ? 'report'
            : 'run';
    const key =
      input.selectionKey ??
      state.current[kind] ??
      (kind === 'report' ? state.current.run : undefined);
    const selection = key ? state.selections.get(key) : undefined;
    if (!selection) {
      throw new PraxisReadError(
        'SELECTION_REQUIRED',
        'Read workspace_overview first, then select the Praxis resource to inspect.',
        false,
      );
    }
    const target = selection.target;
    if (
      !target.projectId ||
      (kind !== 'project' && !target.runId) ||
      (kind === 'submission' && !target.submissionId)
    ) {
      throw new PraxisReadError(
        'SELECTION_INVALID',
        'The selected Praxis resource cannot be used for this view.',
        false,
      );
    }
    state.current[targetKind(target)] = selection.selectionKey;
    return selection;
  }

  private buildRequest(
    input: PraxisReadInput,
    toolCallId: string,
    state: BindingState,
  ): JsonObject {
    const base: JsonObject = {
      schemaVersion: PRAXIS_TOOL_SCHEMA_VERSION,
      toolCallId,
      view: input.view,
    };
    if (input.view === 'workspace_overview') return base;

    const selection = this.select(state, input);
    const target = selection.target;
    if (input.view === 'project_overview') {
      base.scope = { projectId: target.projectId };
    } else if (input.view === 'submission_result') {
      base.scope = {
        projectId: target.projectId,
        runId: target.runId,
        submissionId: target.submissionId,
      };
    } else {
      base.scope = { projectId: target.projectId, runId: target.runId };
    }
    if (input.view === 'run_report' && input.sectionKey) {
      base.sectionKey = input.sectionKey;
    }
    if (input.view === 'artifact_evidence') {
      if (!selection.submissionRef) {
        throw new PraxisReadError(
          'CONTEXT_STALE',
          'Read submission_result before requesting artifact evidence.',
          false,
        );
      }
      base.submissionRef = selection.submissionRef;
      base.query = input.query;
    }
    return base;
  }

  private async send(
    request: JsonObject,
    input: PraxisReadInput,
    publicUserId: string,
    config: PraxisReadIntegrationConfig,
    callerSignal?: AbortSignal,
  ): Promise<JsonObject> {
    const body = canonicalizePraxisJson(request);
    const bodyHash = createHash('sha256').update(body).digest('hex');
    const endpoint = new URL(config.path, `${config.baseUrl}/`).toString();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const traceId = randomUUID();
      const token = createReadToken(
        config,
        publicUserId,
        request.toolCallId as string,
        bodyHash,
      );
      const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, timeoutSignal])
        : timeoutSignal;
      let response: Response;
      try {
        response = await this.performFetch(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Praxis-Integration-Version': PRAXIS_TOOL_SCHEMA_VERSION,
            'X-Trace-Id': traceId,
          },
          body,
          signal,
        });
      } catch (error) {
        if (callerSignal?.aborted) throw error;
        if (attempt === 0) continue;
        throw new PraxisReadError(
          'SERVICE_UNAVAILABLE',
          'Praxis is temporarily unavailable.',
          true,
          traceId,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new PraxisReadError(
          'PROVIDER_RESPONSE_INVALID',
          'Praxis returned a non-JSON response.',
          false,
          traceId,
        );
      }
      if (response.ok) {
        validateProviderResponse(
          payload,
          input,
          request.toolCallId as string,
          request,
        );
        return payload;
      }
      const providerError = readProviderError(
        payload,
        response.status,
        request.toolCallId as string,
        response.headers.get('Retry-After'),
      );
      if (providerError.code === 'TOKEN_EXPIRED' && attempt === 0) continue;
      throw new PraxisReadError(
        providerError.code,
        providerError.message,
        providerError.retryable,
        providerError.traceId,
        providerError.retryAfter,
      );
    }
    throw new PraxisReadError(
      'SERVICE_UNAVAILABLE',
      'Praxis is temporarily unavailable.',
      true,
    );
  }

  private rememberResponse(
    state: BindingState,
    input: PraxisReadInput,
    response: JsonObject,
  ) {
    const found: StoredSelection[] = [];
    visitSelections(response.data, found);
    const data = response.data as JsonObject;
    const ref =
      input.view === 'submission_result'
        ? submissionReference(data.submissionRef)
        : undefined;
    for (const selection of found) {
      if (ref && selection.target.submissionId === ref.submissionId) {
        selection.submissionRef = ref;
      }
      state.selections.set(selection.selectionKey, selection);
      if (state.selections.size > MAX_SELECTIONS_PER_BINDING) {
        state.selections.delete(state.selections.keys().next().value!);
      }
    }

    if (input.view === 'workspace_overview') {
      const projects = Array.isArray(data.projects) ? data.projects : [];
      const runs = Array.isArray(data.runs) ? data.runs : [];
      if (
        projects.length === 1 &&
        isObject(projects[0]) &&
        typeof projects[0].selectionKey === 'string'
      ) {
        state.current.project = projects[0].selectionKey;
      } else {
        delete state.current.project;
      }
      if (
        runs.length === 1 &&
        isObject(runs[0]) &&
        typeof runs[0].selectionKey === 'string'
      ) {
        state.current.run = runs[0].selectionKey;
      } else {
        delete state.current.run;
      }
      return;
    }

    const preferred = found.find((selection) => {
      if (input.view === 'project_overview')
        return targetKind(selection.target) === 'project';
      if (input.view === 'submission_result')
        return targetKind(selection.target) === 'submission';
      if (input.view === 'run_report')
        return targetKind(selection.target) === 'report';
      return targetKind(selection.target) === 'run';
    });
    if (preferred)
      state.current[targetKind(preferred.target)] = preferred.selectionKey;
  }
}
