import { z } from 'zod/v4';
import { buildTool, type Tool, type ToolDef } from '../../../Tool.js';
import { lazySchema } from '../../../utils/lazySchema.js';

export const PRAXIS_TOOL_SCHEMA_VERSION = '1.0.0' as const;
export const PRAXIS_LAUNCH_ACTION_KIND = 'launch_praxis' as const;

export interface PraxisReadContext {
  userId: string;
  conversationId: string;
}

export interface PraxisReadClient {
  readOverview(context: PraxisReadContext): Promise<unknown>;
}

export interface PraxisToolRuntime extends PraxisReadContext {
  readClient?: PraxisReadClient;
  readEnabled?: boolean;
}

export interface PraxisOpenToolResult {
  schemaVersion: typeof PRAXIS_TOOL_SCHEMA_VERSION;
  status: 'ready';
  message: string;
  uiAction: {
    kind: typeof PRAXIS_LAUNCH_ACTION_KIND;
    label: '打开 Praxis';
    destination: 'home';
  };
}

const resultSchema = lazySchema(() => z.object({ result: z.unknown() }));
const openInputSchema = lazySchema(() => z.strictObject({
  destination: z.literal('home').optional(),
}));
const readInputSchema = lazySchema(() => z.strictObject({
  view: z.literal('overview'),
}));

const common = {
  maxResultSizeChars: 20_000,
  strict: true,
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  async checkPermissions(input: Record<string, unknown>) {
    return { behavior: 'allow' as const, updatedInput: input };
  },
  renderToolUseMessage: () => null,
  userFacingName: () => 'Praxis',
  mapToolResultToToolResultBlockParam(data: { result: unknown }, toolUseID: string) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: JSON.stringify(data.result),
    };
  },
};

export function createPraxisOpenResult(): PraxisOpenToolResult {
  return {
    schemaVersion: PRAXIS_TOOL_SCHEMA_VERSION,
    status: 'ready',
    message: 'Praxis 已准备好打开。请让用户点击对话中的“打开 Praxis”按钮。',
    uiAction: {
      kind: PRAXIS_LAUNCH_ACTION_KIND,
      label: '打开 Praxis',
      destination: 'home',
    },
  };
}

export function createPraxisOpenTool(): Tool {
  return buildTool({
    ...common,
    name: 'praxis_open',
    schemaCacheNamespace: 'career-praxis-v1',
    alwaysLoad: true,
    searchHint: 'open launch enter Praxis training platform',
    async description() {
      return 'Prepare an authenticated UI entry to the Praxis training platform. Use when the user asks to open, enter, start, or continue work in Praxis. This tool creates an “打开 Praxis” button; it does not read Praxis progress or return an SSO ticket.';
    },
    async prompt() {
      return 'Call this tool only when opening the Praxis UI is useful. After it succeeds, briefly tell the user to use the generated button. Never invent, request, or expose an SSO ticket or Praxis URL.';
    },
    get inputSchema() { return openInputSchema(); },
    get outputSchema() { return resultSchema(); },
    async call() {
      return { data: { result: createPraxisOpenResult() } };
    },
  } satisfies ToolDef<any, any>);
}

export function createPraxisReadTool(
  runtime: PraxisToolRuntime & { readClient: PraxisReadClient },
): Tool {
  return buildTool({
    ...common,
    name: 'praxis_read',
    schemaCacheNamespace: 'career-praxis-v1',
    alwaysLoad: true,
    searchHint: 'read Praxis training progress results feedback',
    async description() {
      return 'Read the authenticated user’s Praxis training overview. This initial contract supports only view=overview and never accepts a user identifier from the model.';
    },
    async prompt() {
      return 'Use this tool for questions about the current user’s Praxis projects, progress, results, or feedback. Do not guess missing Praxis data.';
    },
    get inputSchema() { return readInputSchema(); },
    get outputSchema() { return resultSchema(); },
    async call() {
      const data = await runtime.readClient.readOverview({
        userId: runtime.userId,
        conversationId: runtime.conversationId,
      });
      return {
        data: {
          result: {
            schemaVersion: PRAXIS_TOOL_SCHEMA_VERSION,
            status: 'available',
            view: 'overview',
            data,
          },
        },
      };
    },
  } satisfies ToolDef<any, any>);
}

export function createPraxisTools(runtime: PraxisToolRuntime): Tool[] {
  const tools: Tool[] = [createPraxisOpenTool()];
  if (runtime.readEnabled === true && runtime.readClient) {
    tools.push(createPraxisReadTool({ ...runtime, readClient: runtime.readClient }));
  }
  return tools;
}
