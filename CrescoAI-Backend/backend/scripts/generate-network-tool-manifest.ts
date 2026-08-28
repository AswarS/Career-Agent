import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Tool } from '../src/Tool.js'
import {
  getEmptyToolPermissionContext,
  type ToolPermissionContext,
} from '../src/Tool.js'
import { createProfileRefreshTools } from '../src/Network/modules/profile/profile-refresh.tools.js'
import { createProfileTools } from '../src/Network/modules/profile/profile.tools.js'
import { initBundledSkills } from '../src/skills/bundled/index.js'
import { isDeferredTool } from '../src/tools/ToolSearchTool/prompt.js'
import { assembleToolPool, getTools } from '../src/tools.js'
import { enableConfigs } from '../src/utils/config.js'
import { getToolSearchMode } from '../src/utils/toolSearch.js'
import { zodToJsonSchema } from '../src/utils/zodToJsonSchema.js'
import { discoverSkillActionTools } from './generate-skill-action-tools.js'

export const MANIFEST_VERSION = '1.0'

export const NETWORK_CONVERSATION_CONTEXT = 'network.conversation'
export const NETWORK_PROFILE_REFRESH_CONTEXT = 'network.profile_refresh'

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

type AvailabilityCondition = {
  type: string
  description: string
}

type ResourceBinding = {
  resource_id: string
  binding?: Record<string, JsonValue>
  requirement?: 'required_in_schema' | 'required_semantically' | 'optional'
  resolution?: string[]
  access?: string
  operations?: string[]
  produced_when?: Record<string, JsonValue>
  when?: Record<string, JsonValue>
}

type ResourceIO = {
  consumes: ResourceBinding[]
  produces: ResourceBinding[]
  reads: ResourceBinding[]
  writes: ResourceBinding[]
}

export type ToolManifestRecord = {
  id: string
  name: string
  aliases: string[]
  tool_type: 'harness_tool' | 'skill_tool'
  skill_binding: {
    skill_name: string
    entry_mode: 'action-tool'
  } | null
  context: string
  schema_cache_namespace: string | null
  description: string
  search_hint: string | null
  input_schema: JsonValue
  output_schema: JsonValue | null
  availability: {
    status: 'available' | 'conditional'
    conditions: AvailabilityCondition[]
  }
  loading: 'eager' | 'deferred'
  properties: {
    read_only: boolean | 'input_dependent'
    destructive: boolean | 'input_dependent'
    concurrency_safe: boolean | 'input_dependent'
    requires_user_interaction: boolean
    strict: boolean
  }
  resource_io: ResourceIO
  source: {
    kind: 'builtin' | 'service' | 'generated_skill_action'
    file: string
    export: string
  }
  schema_hash: string
}

export type NetworkToolManifest = {
  manifest_version: string
  generated_at: string
  source_revision: {
    branch: string
    commit: string
    dirty: boolean
  }
  scope: {
    include_mcp: false
    contexts: string[]
    assumptions: {
      permission_mode: 'allow_all'
      tool_search_mode: string
      tool_search_loading: 'for_supported_models'
      prompt_contract_context: 'api_key_user'
    }
  }
  resources: ResourceDefinition[]
  tools: ToolManifestRecord[]
  excluded_tools: ExcludedToolRecord[]
  warnings: string[]
}

type ResourceDefinition = {
  id: string
  kind: 'artifact' | 'state' | 'handle' | 'snapshot'
  resource_type: string
  schema_version: string | null
  scope: 'user' | 'conversation' | 'session' | 'job'
  persistence: 'workspace' | 'database' | 'session' | 'process' | 'job'
  mutable: boolean
  versioned: boolean
  reference: {
    format: string
    opaque: boolean
  } | null
  description: string
  source: {
    kind: 'declared' | 'curated'
    file: string
  }
}

type ExcludedToolRecord = {
  name: string
  context: string
  reason: string
  enforced_by: 'network_runtime' | 'network_permission'
  source: {
    file: string
    export: string
  }
}

type SourceEntry = {
  file: string
  export: string
}

type SkillActionBinding = {
  skillName: string
  source: SourceEntry
}

export type BuildNetworkToolManifestOptions = {
  backendDir?: string
  projectRoot?: string
  generatedAt?: string
  sourceRevision?: NetworkToolManifest['source_revision']
}

const EMPTY_RESOURCE_IO: ResourceIO = {
  consumes: [],
  produces: [],
  reads: [],
  writes: [],
}

const BUILTIN_SOURCES: Record<string, SourceEntry> = {
  Agent: {
    file: 'CrescoAI-Backend/backend/src/tools/AgentTool/AgentTool.tsx',
    export: 'AgentTool',
  },
  TaskOutput: {
    file: 'CrescoAI-Backend/backend/src/tools/TaskOutputTool/TaskOutputTool.tsx',
    export: 'TaskOutputTool',
  },
  Bash: {
    file: 'CrescoAI-Backend/backend/src/tools/BashTool/BashTool.tsx',
    export: 'BashTool',
  },
  Glob: {
    file: 'CrescoAI-Backend/backend/src/tools/GlobTool/GlobTool.ts',
    export: 'GlobTool',
  },
  Grep: {
    file: 'CrescoAI-Backend/backend/src/tools/GrepTool/GrepTool.ts',
    export: 'GrepTool',
  },
  ExitPlanMode: {
    file: 'CrescoAI-Backend/backend/src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts',
    export: 'ExitPlanModeV2Tool',
  },
  Read: {
    file: 'CrescoAI-Backend/backend/src/tools/FileReadTool/FileReadTool.ts',
    export: 'FileReadTool',
  },
  Edit: {
    file: 'CrescoAI-Backend/backend/src/tools/FileEditTool/FileEditTool.ts',
    export: 'FileEditTool',
  },
  Write: {
    file: 'CrescoAI-Backend/backend/src/tools/FileWriteTool/FileWriteTool.ts',
    export: 'FileWriteTool',
  },
  NotebookEdit: {
    file: 'CrescoAI-Backend/backend/src/tools/NotebookEditTool/NotebookEditTool.ts',
    export: 'NotebookEditTool',
  },
  WebFetch: {
    file: 'CrescoAI-Backend/backend/src/tools/WebFetchTool/WebFetchTool.ts',
    export: 'WebFetchTool',
  },
  TodoWrite: {
    file: 'CrescoAI-Backend/backend/src/tools/TodoWriteTool/TodoWriteTool.ts',
    export: 'TodoWriteTool',
  },
  WebSearch: {
    file: 'CrescoAI-Backend/backend/src/tools/WebSearchTool/WebSearchTool.ts',
    export: 'WebSearchTool',
  },
  TaskStop: {
    file: 'CrescoAI-Backend/backend/src/tools/TaskStopTool/TaskStopTool.ts',
    export: 'TaskStopTool',
  },
  AskUserQuestion: {
    file: 'CrescoAI-Backend/backend/src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx',
    export: 'AskUserQuestionTool',
  },
  Skill: {
    file: 'CrescoAI-Backend/backend/src/tools/SkillTool/SkillTool.ts',
    export: 'SkillTool',
  },
  ReturnSkillResult: {
    file: 'CrescoAI-Backend/backend/src/tools/ReturnSkillResultTool/ReturnSkillResultTool.ts',
    export: 'ReturnSkillResultTool',
  },
  GetLearningState: {
    file: 'CrescoAI-Backend/backend/src/tools/GetLearningStateTool/GetLearningStateTool.ts',
    export: 'GetLearningStateTool',
  },
  ActivateLearningPlan: {
    file: 'CrescoAI-Backend/backend/src/tools/ActivateLearningPlanTool/ActivateLearningPlanTool.ts',
    export: 'ActivateLearningPlanTool',
  },
  UpdateLearningProgress: {
    file: 'CrescoAI-Backend/backend/src/tools/UpdateLearningProgressTool/UpdateLearningProgressTool.ts',
    export: 'UpdateLearningProgressTool',
  },
  UpdateLearningPlan: {
    file: 'CrescoAI-Backend/backend/src/tools/UpdateLearningPlanTool/UpdateLearningPlanTool.ts',
    export: 'UpdateLearningPlanTool',
  },
  EnterPlanMode: {
    file: 'CrescoAI-Backend/backend/src/tools/EnterPlanModeTool/EnterPlanModeTool.ts',
    export: 'EnterPlanModeTool',
  },
  ImageGenerate: {
    file: 'CrescoAI-Backend/backend/src/tools/ImageGenerateTool/ImageGenerateTool.ts',
    export: 'ImageGenerateTool',
  },
  VideoGenerate: {
    file: 'CrescoAI-Backend/backend/src/tools/VideoGenerateTool/VideoGenerateTool.ts',
    export: 'VideoGenerateTool',
  },
  EnterWorktree: {
    file: 'CrescoAI-Backend/backend/src/tools/EnterWorktreeTool/EnterWorktreeTool.ts',
    export: 'EnterWorktreeTool',
  },
  ExitWorktree: {
    file: 'CrescoAI-Backend/backend/src/tools/ExitWorktreeTool/ExitWorktreeTool.ts',
    export: 'ExitWorktreeTool',
  },
  ToolSearch: {
    file: 'CrescoAI-Backend/backend/src/tools/ToolSearchTool/ToolSearchTool.ts',
    export: 'ToolSearchTool',
  },
}

const PROFILE_CONVERSATION_SOURCE: SourceEntry = {
  file: 'CrescoAI-Backend/backend/src/Network/modules/profile/profile.tools.ts',
  export: 'createProfileTools',
}

const PROFILE_REFRESH_SOURCE: SourceEntry = {
  file: 'CrescoAI-Backend/backend/src/Network/modules/profile/profile-refresh.tools.ts',
  export: 'createProfileRefreshTools',
}

const EXCLUDED_NETWORK_TOOLS: Record<
  string,
  Pick<ExcludedToolRecord, 'reason' | 'enforced_by'>
> = {
  Agent: {
    reason:
      'Network QueryEngine is constructed with agents: []; the default agent type cannot be resolved.',
    enforced_by: 'network_runtime',
  },
  EnterWorktree: {
    reason:
      'Network sessions are pinned to the user workspace and reject working-directory mutation.',
    enforced_by: 'network_permission',
  },
  ExitWorktree: {
    reason:
      'Network sessions are pinned to the user workspace and reject working-directory mutation.',
    enforced_by: 'network_permission',
  },
}

const RESOURCES: ResourceDefinition[] = [
  artifactResource(
    'BaselineAssessment',
    'A versioned assessment of the user evidence baseline for a target role, domain, or task.',
    'CrescoAI-Backend/backend/src/tools/BaselineAssessmentTool/artifactAdapter.ts',
  ),
  artifactResource(
    'CareerCompetencyModel',
    'A source-backed model of current competency requirements for a career target.',
    'CrescoAI-Backend/backend/src/tools/CareerCompetencyModelTool/artifactAdapter.ts',
  ),
  artifactResource(
    'LearningPlan',
    'A versioned staged learning plan grounded in a competency model and baseline assessment.',
    'CrescoAI-Backend/backend/src/tools/LearningPlanTool/artifactAdapter.ts',
  ),
  artifactResource(
    'LearningStagePackage',
    'An executable package for the current stage of an activated learning plan.',
    'CrescoAI-Backend/backend/src/tools/LearningStageDesignTool/artifactAdapter.ts',
  ),
  artifactResource(
    'LearningProgressAssessment',
    'An assessment of visible evidence against the current learning stage rubric.',
    'CrescoAI-Backend/backend/src/tools/LearningProgressAssessmentTool/artifactAdapter.ts',
  ),
  {
    id: 'state:LearningState@1.0',
    kind: 'state',
    resource_type: 'LearningState',
    schema_version: '1.0',
    scope: 'user',
    persistence: 'workspace',
    mutable: true,
    versioned: true,
    reference: null,
    description:
      'The active learning-plan collection, focus plan, current stage, and progress state.',
    source: {
      kind: 'declared',
      file: 'CrescoAI-Backend/backend/src/learning/learningStateService.ts',
    },
  },
  {
    id: 'state:ProductProfile',
    kind: 'state',
    resource_type: 'ProductProfile',
    schema_version: null,
    scope: 'user',
    persistence: 'database',
    mutable: true,
    versioned: true,
    reference: null,
    description: 'The authenticated user career, education, and learning Profile.',
    source: {
      kind: 'declared',
      file:
        'CrescoAI-Backend/backend/src/Network/modules/profile/profile-product.types.ts',
    },
  },
  {
    id: 'state:ProfileRefreshOverlay',
    kind: 'state',
    resource_type: 'ProfileRefreshOverlay',
    schema_version: null,
    scope: 'job',
    persistence: 'job',
    mutable: true,
    versioned: false,
    reference: null,
    description:
      'A job-local Profile snapshot plus staged mutations that are not directly persisted.',
    source: {
      kind: 'declared',
      file:
        'CrescoAI-Backend/backend/src/Network/modules/profile/profile-refresh.tools.ts',
    },
  },
  {
    id: 'state:PlanMode',
    kind: 'state',
    resource_type: 'PlanMode',
    schema_version: null,
    scope: 'conversation',
    persistence: 'session',
    mutable: true,
    versioned: false,
    reference: null,
    description: 'Whether the current conversation is in planning mode.',
    source: {
      kind: 'curated',
      file: 'CrescoAI-Backend/backend/src/tools/EnterPlanModeTool/EnterPlanModeTool.ts',
    },
  },
  {
    id: 'handle:BackgroundTask',
    kind: 'handle',
    resource_type: 'BackgroundTask',
    schema_version: null,
    scope: 'session',
    persistence: 'process',
    mutable: true,
    versioned: false,
    reference: {
      format: 'task_id',
      opaque: true,
    },
    description: 'An opaque handle for a running or completed background task.',
    source: {
      kind: 'curated',
      file: 'CrescoAI-Backend/backend/src/tools/TaskOutputTool/TaskOutputTool.tsx',
    },
  },
  {
    id: 'handle:SkillInvocation',
    kind: 'handle',
    resource_type: 'SkillInvocation',
    schema_version: null,
    scope: 'conversation',
    persistence: 'session',
    mutable: true,
    versioned: false,
    reference: {
      format: 'skill_call_id',
      opaque: true,
    },
    description: 'The lifecycle handle for an active prompt Skill invocation.',
    source: {
      kind: 'curated',
      file: 'CrescoAI-Backend/backend/src/skills/skillLifecycle.ts',
    },
  },
  snapshotResource(
    'LearningState',
    'A read-only view of the current LearningState returned to the model.',
    'CrescoAI-Backend/backend/src/tools/GetLearningStateTool/GetLearningStateTool.ts',
  ),
  snapshotResource(
    'ProductProfile',
    'A read-only product Profile view returned to the model.',
    'CrescoAI-Backend/backend/src/Network/modules/profile/profile.tools.ts',
  ),
  snapshotResource(
    'ProfileRefreshOverlay',
    'A read-only view of the current job-local Profile refresh overlay.',
    'CrescoAI-Backend/backend/src/Network/modules/profile/profile-refresh.tools.ts',
    'job',
  ),
]

const RESOURCE_IO_BY_TOOL: Record<string, ResourceIO> = {
  [`${NETWORK_CONVERSATION_CONTEXT}:Bash`]: resourceIO({
    produces: [
      {
        resource_id: 'handle:BackgroundTask',
        binding: { output_field: 'backgroundTaskId' },
        produced_when: { 'input.run_in_background': true },
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:TaskOutput`]: resourceIO({
    consumes: [
      {
        resource_id: 'handle:BackgroundTask',
        binding: { input_field: 'task_id' },
        requirement: 'required_in_schema',
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:TaskStop`]: resourceIO({
    consumes: [
      {
        resource_id: 'handle:BackgroundTask',
        binding: { input_fields: ['task_id', 'shell_id'] },
        requirement: 'required_semantically',
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:EnterPlanMode`]: resourceIO({
    writes: [
      {
        resource_id: 'state:PlanMode',
        access: 'enter',
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:ExitPlanMode`]: resourceIO({
    reads: [
      {
        resource_id: 'state:PlanMode',
        access: 'require_active',
      },
    ],
    writes: [
      {
        resource_id: 'state:PlanMode',
        access: 'exit',
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:Skill`]: resourceIO({
    produces: [
      {
        resource_id: 'handle:SkillInvocation',
        binding: {
          runtime_field: 'skill_call_id',
          visibility: 'injected_skill_context',
        },
        produced_when: { status: 'started_or_running' },
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:ReturnSkillResult`]: resourceIO({
    consumes: [
      {
        resource_id: 'handle:SkillInvocation',
        binding: { input_field: 'skill_call_id' },
        requirement: 'required_in_schema',
      },
    ],
    writes: [
      {
        resource_id: 'handle:SkillInvocation',
        access: 'complete',
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:BaselineAssessment`]: resourceIO({
    produces: [artifactOutput('BaselineAssessment')],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:CareerCompetencyModel`]: resourceIO({
    produces: [artifactOutput('CareerCompetencyModel')],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:LearningPlan`]: resourceIO({
    consumes: [
      artifactInput('CareerCompetencyModel', 'model_ref', [
        'explicit_input',
        'latest_matching_context_artifact',
      ]),
      artifactInput('BaselineAssessment', 'baseline_ref', [
        'explicit_input',
        'latest_matching_context_artifact',
      ]),
    ],
    produces: [artifactOutput('LearningPlan')],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:GetLearningState`]: resourceIO({
    reads: [{ resource_id: 'state:LearningState@1.0', access: 'read' }],
    produces: [
      {
        resource_id: 'snapshot:LearningState',
        binding: { output_field: '$' },
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:ActivateLearningPlan`]: resourceIO({
    consumes: [
      artifactInput(
        'LearningPlan',
        'plan_ref',
        ['explicit_input'],
        'required_in_schema',
      ),
    ],
    writes: [
      {
        resource_id: 'state:LearningState@1.0',
        access: 'activate_plan',
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:LearningStageDesign`]: resourceIO({
    consumes: [
      artifactByLogicalSelector(
        'LearningPlan',
        'plan_id',
        ['learning_state_resolution', 'focus_plan_resolution'],
        'required_semantically',
      ),
    ],
    reads: [
      {
        resource_id: 'state:LearningState@1.0',
        access: 'read_current_stage',
      },
    ],
    produces: [artifactOutput('LearningStagePackage')],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:LearningProgressAssessment`]: resourceIO({
    consumes: [
      artifactByLogicalSelector(
        'LearningStagePackage',
        'plan_id',
        ['learning_state_resolution', 'focus_plan_resolution'],
        'required_semantically',
      ),
    ],
    reads: [
      {
        resource_id: 'state:LearningState@1.0',
        access: 'read_current_stage_rubric',
      },
    ],
    produces: [artifactOutput('LearningProgressAssessment')],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:UpdateLearningProgress`]: resourceIO({
    consumes: [
      {
        ...artifactInput(
          'LearningStagePackage',
          'stage_package_ref',
          ['explicit_input'],
          'required_in_schema',
        ),
        when: { 'input.operation': 'attach_stage_package' },
      },
      {
        ...artifactInput(
          'LearningProgressAssessment',
          'assessment_ref',
          ['explicit_input'],
          'required_in_schema',
        ),
        when: { 'input.operation': 'record_assessment' },
      },
    ],
    writes: [
      {
        resource_id: 'state:LearningState@1.0',
        access: 'transition',
        operations: [
          'attach_stage_package',
          'mark_ready_for_assessment',
          'record_assessment',
          'advance_stage',
        ],
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:UpdateLearningPlan`]: resourceIO({
    consumes: [
      artifactByLogicalSelector(
        'LearningPlan',
        'plan_id',
        ['learning_state_resolution'],
        'required_in_schema',
      ),
    ],
    reads: [
      {
        resource_id: 'state:LearningState@1.0',
        access: 'read_active_plan',
      },
    ],
    writes: [
      {
        resource_id: 'state:LearningState@1.0',
        access: 'replace_plan_version',
      },
    ],
    produces: [
      artifactOutput('LearningPlan', {
        updated: true,
        'artifact.status': ['ready', 'canonical_only'],
      }),
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:profile_read`]: resourceIO({
    reads: [{ resource_id: 'state:ProductProfile', access: 'read' }],
    produces: [
      {
        resource_id: 'snapshot:ProductProfile',
        binding: { output_field: 'result' },
      },
    ],
  }),
  [`${NETWORK_CONVERSATION_CONTEXT}:profile_update`]: resourceIO({
    writes: [
      {
        resource_id: 'state:ProductProfile',
        access: 'mutate',
        operations: ['set', 'clear', 'add', 'remove'],
      },
    ],
  }),
  [`${NETWORK_PROFILE_REFRESH_CONTEXT}:profile_read`]: resourceIO({
    reads: [{ resource_id: 'state:ProfileRefreshOverlay', access: 'read' }],
    produces: [
      {
        resource_id: 'snapshot:ProfileRefreshOverlay',
        binding: { output_field: 'result' },
      },
    ],
  }),
  [`${NETWORK_PROFILE_REFRESH_CONTEXT}:profile_update`]: resourceIO({
    writes: [
      {
        resource_id: 'state:ProfileRefreshOverlay',
        access: 'stage_mutation',
        operations: ['set', 'clear', 'add', 'remove'],
      },
    ],
  }),
}

function artifactResource(
  type: string,
  description: string,
  file: string,
): ResourceDefinition {
  return {
    id: `artifact:${type}@1.0`,
    kind: 'artifact',
    resource_type: type,
    schema_version: '1.0',
    scope: 'user',
    persistence: 'workspace',
    mutable: false,
    versioned: true,
    reference: {
      format: 'artifact://<uuid>',
      opaque: true,
    },
    description,
    source: { kind: 'declared', file },
  }
}

function snapshotResource(
  type: string,
  description: string,
  file: string,
  scope: 'user' | 'job' = 'user',
): ResourceDefinition {
  return {
    id: `snapshot:${type}`,
    kind: 'snapshot',
    resource_type: `${type}Snapshot`,
    schema_version: null,
    scope,
    persistence: scope === 'job' ? 'job' : 'session',
    mutable: false,
    versioned: false,
    reference: null,
    description,
    source: { kind: 'curated', file },
  }
}

function resourceIO(input: Partial<ResourceIO>): ResourceIO {
  return {
    consumes: input.consumes ?? [],
    produces: input.produces ?? [],
    reads: input.reads ?? [],
    writes: input.writes ?? [],
  }
}

function artifactInput(
  type: string,
  inputField: string,
  resolution: string[],
  requirement: ResourceBinding['requirement'] = 'required_semantically',
): ResourceBinding {
  return {
    resource_id: `artifact:${type}@1.0`,
    binding: {
      input_field: inputField,
      accepted_reference: 'artifact://<uuid>',
    },
    requirement,
    resolution,
  }
}

function artifactByLogicalSelector(
  type: string,
  inputField: string,
  resolution: string[],
  requirement: ResourceBinding['requirement'],
): ResourceBinding {
  return {
    resource_id: `artifact:${type}@1.0`,
    binding: {
      input_field: inputField,
      input_value: 'logical_id',
    },
    requirement,
    resolution,
  }
}

function artifactOutput(
  type: string,
  producedWhen: Record<string, JsonValue> = {
    outcome: 'success',
    'artifact.status': ['ready', 'canonical_only'],
  },
): ResourceBinding {
  return {
    resource_id: `artifact:${type}@1.0`,
    binding: {
      output_field: 'artifact.artifact_ref',
    },
    produced_when: producedWhen,
  }
}

function cloneResourceIO(value: ResourceIO | undefined): ResourceIO {
  return structuredClone(value ?? EMPTY_RESOURCE_IO)
}

function asJsonValue(value: unknown): JsonValue {
  return value as JsonValue
}

function evaluateBoolean(
  evaluate: () => boolean,
): boolean | 'input_dependent' {
  try {
    return Boolean(evaluate())
  } catch {
    return 'input_dependent'
  }
}

function stableValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

function stableJson(value: JsonValue): string {
  return JSON.stringify(stableValue(value))
}

function manifestToolId(input: {
  context: string
  toolType: ToolManifestRecord['tool_type']
  name: string
  namespace?: string
}): string {
  return [input.context, input.toolType, input.name, input.namespace]
    .filter(Boolean)
    .join(':')
}

function profileRuntimeStub(): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_target, property) {
        return () => {
          throw new Error(
            `Manifest generation must not execute Profile service method ${String(property)}`,
          )
        }
      },
    },
  )
}

function createConversationProfileTools(): Tool[] {
  const service = profileRuntimeStub()
  return createProfileTools({
    userId: 0,
    conversationId: 'tool-manifest',
    baseService: service,
    memoryService: service,
    proposalService: service,
    recallService: service,
    productProjectionService: service,
    productMutationService: service,
  } as never)
}

function createRefreshProfileTools(): Tool[] {
  return createProfileRefreshTools({
    snapshot: {} as never,
    allowedEvidenceRefs: new Set(),
    staged: [],
  })
}

function withProductionNodeEnv<T>(run: () => T): T {
  const previous = process.env.NODE_ENV
  if (previous === 'test') delete process.env.NODE_ENV
  try {
    return run()
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
}

async function withCanonicalPromptAuth<T>(run: () => Promise<T>): Promise<T> {
  const names = [
    'ANTHROPIC_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
  ] as const
  const previous = new Map(names.map(name => [name, process.env[name]]))
  process.env.ANTHROPIC_API_KEY = 'sk-ant-tool-manifest-placeholder'
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
  try {
    return await run()
  } finally {
    for (const name of names) {
      const value = previous.get(name)
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

async function resolveSkillActionBindings(input: {
  backendDir: string
  projectRoot: string
}): Promise<Map<string, SkillActionBinding>> {
  const specs = await discoverSkillActionTools({
    skillsDir: resolve(input.projectRoot, 'skills'),
    toolsDir: resolve(input.backendDir, 'src/tools'),
  })
  return new Map(
    specs.map(spec => [
      spec.toolName,
      {
        skillName: spec.skillName,
        source: {
          file: relative(input.projectRoot, spec.outputFile).replaceAll('\\', '/'),
          export: spec.exportName,
        },
      },
    ]),
  )
}

function sourceForTool(input: {
  tool: Tool
  context: string
  skillActionBindings: Map<string, SkillActionBinding>
}): ToolManifestRecord['source'] {
  const skill = input.skillActionBindings.get(input.tool.name)
  if (skill) {
    return {
      kind: 'generated_skill_action',
      ...skill.source,
    }
  }
  if (
    input.tool.name === 'profile_read' ||
    input.tool.name === 'profile_update'
  ) {
    return {
      kind: 'service',
      ...(input.context === NETWORK_PROFILE_REFRESH_CONTEXT
        ? PROFILE_REFRESH_SOURCE
        : PROFILE_CONVERSATION_SOURCE),
    }
  }
  const source = BUILTIN_SOURCES[input.tool.name]
  if (!source) {
    throw new Error(
      `Tool ${input.tool.name} entered the Network manifest without source provenance`,
    )
  }
  return { kind: 'builtin', ...source }
}

function availabilityForTool(tool: Tool): ToolManifestRecord['availability'] {
  if (tool.name === 'ToolSearch') {
    return {
      status: 'conditional',
      conditions: [
        {
          type: 'model_capability',
          description: 'The selected model must support tool_reference blocks.',
        },
        {
          type: 'tool_search_mode',
          description: 'Tool search must not be disabled for the request provider.',
        },
      ],
    }
  }
  return { status: 'available', conditions: [] }
}

async function manifestRecord(input: {
  tool: Tool
  context: string
  allContextTools: readonly Tool[]
  permissionContext: ToolPermissionContext
  skillActionBindings: Map<string, SkillActionBinding>
}): Promise<ToolManifestRecord> {
  const skill = input.skillActionBindings.get(input.tool.name)
  const toolType = skill ? 'skill_tool' : 'harness_tool'
  const inputSchema = asJsonValue(
    input.tool.inputJSONSchema ?? zodToJsonSchema(input.tool.inputSchema),
  )
  const outputSchema = input.tool.outputSchema
    ? asJsonValue(zodToJsonSchema(input.tool.outputSchema))
    : null
  const description = await input.tool.prompt({
    getToolPermissionContext: async () => input.permissionContext,
    tools: input.allContextTools,
    agents: [],
  })
  const contract = asJsonValue({
    description,
    input_schema: inputSchema,
    output_schema: outputSchema,
  })

  return {
    id: manifestToolId({
      context: input.context,
      toolType,
      name: input.tool.name,
      namespace: input.tool.schemaCacheNamespace,
    }),
    name: input.tool.name,
    aliases: [...(input.tool.aliases ?? [])],
    tool_type: toolType,
    skill_binding: skill
      ? { skill_name: skill.skillName, entry_mode: 'action-tool' }
      : null,
    context: input.context,
    schema_cache_namespace: input.tool.schemaCacheNamespace ?? null,
    description,
    search_hint: input.tool.searchHint ?? null,
    input_schema: inputSchema,
    output_schema: outputSchema,
    availability: availabilityForTool(input.tool),
    loading: isDeferredTool(input.tool) ? 'deferred' : 'eager',
    properties: {
      read_only: evaluateBoolean(() => input.tool.isReadOnly({} as never)),
      destructive: evaluateBoolean(
        () => input.tool.isDestructive?.({} as never) ?? false,
      ),
      concurrency_safe: evaluateBoolean(() =>
        input.tool.isConcurrencySafe({} as never),
      ),
      requires_user_interaction:
        input.tool.requiresUserInteraction?.() ?? false,
      strict: input.tool.strict === true,
    },
    resource_io: cloneResourceIO(
      RESOURCE_IO_BY_TOOL[`${input.context}:${input.tool.name}`],
    ),
    source: sourceForTool({
      tool: input.tool,
      context: input.context,
      skillActionBindings: input.skillActionBindings,
    }),
    schema_hash: `sha256:${createHash('sha256').update(stableJson(contract)).digest('hex')}`,
  }
}

function sourceRevision(projectRoot: string): NetworkToolManifest['source_revision'] {
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  try {
    return {
      branch: git('branch', '--show-current') || '<detached>',
      commit: git('rev-parse', '--short=12', 'HEAD'),
      dirty: Boolean(git('status', '--short')),
    }
  } catch {
    return {
      branch: '<unknown>',
      commit: '<unknown>',
      dirty: true,
    }
  }
}

function validateManifest(manifest: NetworkToolManifest): void {
  const ids = new Set<string>()
  for (const tool of manifest.tools) {
    if (ids.has(tool.id)) throw new Error(`Duplicate manifest Tool id ${tool.id}`)
    ids.add(tool.id)
    if (tool.name.startsWith('mcp__')) {
      throw new Error(`MCP Tool ${tool.name} must not enter this manifest`)
    }
    if (tool.tool_type === 'skill_tool' && !tool.skill_binding) {
      throw new Error(`Skill Tool ${tool.name} is missing skill_binding`)
    }
    if (tool.tool_type === 'harness_tool' && tool.skill_binding) {
      throw new Error(`Harness Tool ${tool.name} must not have skill_binding`)
    }
  }

  const resourceIds = new Set(manifest.resources.map(resource => resource.id))
  if (resourceIds.size !== manifest.resources.length) {
    throw new Error('Duplicate resource id in manifest')
  }
  for (const tool of manifest.tools) {
    for (const binding of [
      ...tool.resource_io.consumes,
      ...tool.resource_io.produces,
      ...tool.resource_io.reads,
      ...tool.resource_io.writes,
    ]) {
      if (!resourceIds.has(binding.resource_id)) {
        throw new Error(
          `Tool ${tool.id} references unknown resource ${binding.resource_id}`,
        )
      }
    }
  }

  for (const key of Object.keys(RESOURCE_IO_BY_TOOL)) {
    const separator = key.lastIndexOf(':')
    const context = key.slice(0, separator)
    const name = key.slice(separator + 1)
    if (!manifest.tools.some(tool => tool.context === context && tool.name === name)) {
      throw new Error(`Resource annotation ${key} has no exported Tool record`)
    }
  }
}

async function validateSourceFiles(
  manifest: NetworkToolManifest,
  projectRoot: string,
): Promise<void> {
  const files = new Set([
    ...manifest.tools.map(tool => tool.source.file),
    ...manifest.excluded_tools.map(tool => tool.source.file),
    ...manifest.resources.map(resource => resource.source.file),
  ])
  for (const file of files) {
    try {
      await access(resolve(projectRoot, file))
    } catch {
      throw new Error(`Manifest provenance source does not exist: ${file}`)
    }
  }
}

export async function buildNetworkToolManifest(
  options: BuildNetworkToolManifestOptions = {},
): Promise<NetworkToolManifest> {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const backendDir = resolve(options.backendDir ?? resolve(scriptDir, '..'))
  const projectRoot = resolve(
    options.projectRoot ?? resolve(backendDir, '../..'),
  )

  enableConfigs()
  initBundledSkills()

  const permissionContext = getEmptyToolPermissionContext()
  const builtInTools = withProductionNodeEnv(() => getTools(permissionContext))
  const conversationProfileTools = createConversationProfileTools()
  const conversationPool = withProductionNodeEnv(() =>
    assembleToolPool(permissionContext, conversationProfileTools),
  )
  const excludedTools: ExcludedToolRecord[] = []
  const usableConversationTools = conversationPool.filter(tool => {
    const exclusion = EXCLUDED_NETWORK_TOOLS[tool.name]
    if (!exclusion) return true
    const source = BUILTIN_SOURCES[tool.name]
    if (!source) throw new Error(`Excluded Tool ${tool.name} has no source`)
    excludedTools.push({
      name: tool.name,
      context: NETWORK_CONVERSATION_CONTEXT,
      ...exclusion,
      source,
    })
    return false
  })

  const refreshTools = createRefreshProfileTools()
  const skillActionBindings = await resolveSkillActionBindings({
    backendDir,
    projectRoot,
  })
  const { conversationRecords, refreshRecords } =
    await withCanonicalPromptAuth(async () => ({
      conversationRecords: await Promise.all(
        usableConversationTools.map(tool =>
          manifestRecord({
            tool,
            context: NETWORK_CONVERSATION_CONTEXT,
            allContextTools: conversationPool,
            permissionContext,
            skillActionBindings,
          }),
        ),
      ),
      refreshRecords: await Promise.all(
        refreshTools.map(tool =>
          manifestRecord({
            tool,
            context: NETWORK_PROFILE_REFRESH_CONTEXT,
            allContextTools: refreshTools,
            permissionContext,
            skillActionBindings,
          }),
        ),
      ),
    }))

  const warnings: string[] = []
  const builtInNames = new Set(builtInTools.map(tool => tool.name))
  for (const name of Object.keys(EXCLUDED_NETWORK_TOOLS)) {
    if (!builtInNames.has(name)) {
      warnings.push(
        `Known Network exclusion ${name} was not registered in this environment.`,
      )
    }
  }

  const manifest: NetworkToolManifest = {
    manifest_version: MANIFEST_VERSION,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    source_revision:
      options.sourceRevision ?? sourceRevision(projectRoot),
    scope: {
      include_mcp: false,
      contexts: [
        NETWORK_CONVERSATION_CONTEXT,
        NETWORK_PROFILE_REFRESH_CONTEXT,
      ],
      assumptions: {
        permission_mode: 'allow_all',
        tool_search_mode: getToolSearchMode(),
        tool_search_loading: 'for_supported_models',
        prompt_contract_context: 'api_key_user',
      },
    },
    resources: structuredClone(RESOURCES),
    tools: [...conversationRecords, ...refreshRecords],
    excluded_tools: excludedTools,
    warnings,
  }
  validateManifest(manifest)
  await validateSourceFiles(manifest, projectRoot)
  return manifest
}

function withoutVolatileMetadata(manifest: NetworkToolManifest): JsonValue {
  const {
    generated_at: _generatedAt,
    source_revision: _sourceRevision,
    ...rest
  } = manifest
  return asJsonValue(rest)
}

export function hasNetworkToolManifestContractDrift(
  existing: NetworkToolManifest,
  generated: NetworkToolManifest,
): boolean {
  return (
    stableJson(withoutVolatileMetadata(existing)) !==
    stableJson(withoutVolatileMetadata(generated))
  )
}

async function readExistingManifest(
  outputFile: string,
): Promise<NetworkToolManifest | null> {
  try {
    return JSON.parse(await readFile(outputFile, 'utf8')) as NetworkToolManifest
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function writeNetworkToolManifest(input: {
  outputFile: string
  manifest: NetworkToolManifest
}): Promise<{ changed: boolean; manifest: NetworkToolManifest }> {
  const existing = await readExistingManifest(input.outputFile)
  const unchanged =
    existing !== null &&
    !hasNetworkToolManifestContractDrift(existing, input.manifest)
  const manifest = unchanged
    ? { ...input.manifest, generated_at: existing.generated_at }
    : input.manifest
  const next = `${JSON.stringify(manifest, null, 2)}\n`
  const current = existing ? `${JSON.stringify(existing, null, 2)}\n` : null
  if (next !== current) {
    await mkdir(dirname(input.outputFile), { recursive: true })
    await writeFile(input.outputFile, next, 'utf8')
  }
  return { changed: next !== current, manifest }
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index < 0 ? undefined : args[index + 1]
}

async function main(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const backendDir = resolve(scriptDir, '..')
  const projectRoot = resolve(backendDir, '../..')
  const args = process.argv.slice(2)
  const outputFile = resolve(
    flagValue(args, '--output') ??
      resolve(backendDir, 'generated/network-tool-manifest.json'),
  )
  const manifest = await buildNetworkToolManifest({ backendDir, projectRoot })

  if (args.includes('--check')) {
    const existing = await readExistingManifest(outputFile)
    if (
      !existing ||
      hasNetworkToolManifestContractDrift(existing, manifest)
    ) {
      throw new Error(`Network Tool manifest is stale: ${outputFile}`)
    }
    process.stdout.write(
      `${JSON.stringify({ mode: 'check', output_file: outputFile, tools: existing.tools.length, resources: existing.resources.length }, null, 2)}\n`,
    )
    return
  }

  const result = await writeNetworkToolManifest({ outputFile, manifest })
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: 'write',
        output_file: outputFile,
        changed: result.changed,
        tools: result.manifest.tools.length,
        resources: result.manifest.resources.length,
        excluded_tools: result.manifest.excluded_tools.length,
      },
      null,
      2,
    )}\n`,
  )
}

if (import.meta.main) {
  await main()
}
