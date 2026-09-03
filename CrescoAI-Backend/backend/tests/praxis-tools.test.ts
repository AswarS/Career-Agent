import { describe, expect, test } from 'bun:test';
import {
  createPraxisOpenResult,
  createPraxisTools,
  type PraxisReadContext,
  type PraxisReadInput,
} from '../src/Network/modules/integration/praxis.tools.js';
import { extractPraxisMessageActions } from '../src/Network/modules/integration/praxis-message-actions.js';

describe('Praxis Agent tools', () => {
  test('registers the open tool while the read integration is unavailable', async () => {
    const tools = createPraxisTools({
      userId: '42',
      conversationId: 'conversation-1',
    });

    expect(tools.map((tool) => tool.name)).toEqual(['praxis_open']);
    const output = await tools[0]!.call(
      { destination: 'home' },
      undefined as never,
      undefined as never,
      undefined as never,
    );
    expect(output.data).toEqual({ result: createPraxisOpenResult() });
    expect(JSON.stringify(output.data)).not.toContain('targetUrl');
    expect(JSON.stringify(output.data)).not.toContain('ticket');
  });

  test('projects a successful open result into a stable message action', () => {
    const actions = extractPraxisMessageActions([
      {
        id: 'tool-result-1',
        type: 'tool_result',
        toolUseId: 'praxis-open-1',
        text: JSON.stringify(createPraxisOpenResult()),
      },
    ]);

    expect(actions).toEqual([
      {
        id: 'action-launch-praxis-praxis-open-1',
        kind: 'launch_praxis',
        label: '打开 Praxis',
        destination: 'home',
      },
    ]);
  });

  test('does not project malformed or failed tool results', () => {
    expect(
      extractPraxisMessageActions([
        { id: 'invalid', type: 'tool_result', text: '{not-json' },
        {
          id: 'failed',
          type: 'tool_result',
          isError: true,
          text: JSON.stringify(createPraxisOpenResult()),
        },
        {
          id: 'plain-text',
          type: 'text',
          text: JSON.stringify(createPraxisOpenResult()),
        },
      ]),
    ).toEqual([]);
  });

  test('registers read only with an enabled client and binds server identity', async () => {
    const calls: Array<{ input: PraxisReadInput; context: PraxisReadContext }> =
      [];
    const providerResult = {
      schemaVersion: '1.0.0',
      traceId: 'trace_test_001',
      toolCallId: 'toolcall_read_001',
      view: 'workspace_overview',
      observedAt: '2026-09-03T00:00:00Z',
      scope: {},
      snapshot: {
        snapshotToken: 'snapshot_test_000001',
        sourceVersions: {
          projects: [],
          runs: [],
          nodes: [],
          submissions: [],
          reports: [],
        },
      },
      activeOperations: [],
      data: { projects: [], runs: [], nextCursor: null },
    };
    const tools = createPraxisTools({
      userId: '42',
      conversationId: 'conversation-1',
      readEnabled: true,
      readClient: {
        async read(input, context) {
          calls.push({ input, context });
          return providerResult;
        },
      },
    });
    const readTool = tools.find((tool) => tool.name === 'praxis_read');

    expect(readTool).toBeDefined();
    const output = await readTool!.call(
      { view: 'workspace_overview' },
      {
        toolUseId: 'toolcall_read_001',
        messages: [
          { type: 'user', uuid: 'turn-1', message: { content: 'status' } },
        ],
        abortController: new AbortController(),
      } as never,
      undefined as never,
      undefined as never,
    );

    expect(calls).toEqual([
      {
        input: { view: 'workspace_overview' },
        context: {
          userId: '42',
          conversationId: 'conversation-1',
          toolCallId: 'toolcall_read_001',
          turnId: 'turn-1',
          signal: expect.any(AbortSignal),
        },
      },
    ]);
    expect(output.data).toEqual({ result: providerResult });

    expect(
      readTool!.inputSchema.safeParse({
        view: 'artifact_evidence',
        query: 'cache evidence',
      }).success,
    ).toBe(true);
    expect(
      readTool!.inputSchema.safeParse({
        view: 'run_context',
        projectId: 'project_forged',
      }).success,
    ).toBe(false);
  });
});
