import { describe, expect, test } from 'bun:test';
import {
  createPraxisOpenResult,
  createPraxisTools,
  type PraxisReadContext,
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
    const actions = extractPraxisMessageActions([{
      id: 'tool-result-1',
      type: 'tool_result',
      toolUseId: 'praxis-open-1',
      text: JSON.stringify(createPraxisOpenResult()),
    }]);

    expect(actions).toEqual([{
      id: 'action-launch-praxis-praxis-open-1',
      kind: 'launch_praxis',
      label: '打开 Praxis',
      destination: 'home',
    }]);
  });

  test('does not project malformed or failed tool results', () => {
    expect(extractPraxisMessageActions([
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
    ])).toEqual([]);
  });

  test('registers read only with an enabled client and binds server identity', async () => {
    const calls: PraxisReadContext[] = [];
    const tools = createPraxisTools({
      userId: '42',
      conversationId: 'conversation-1',
      readEnabled: true,
      readClient: {
        async readOverview(context) {
          calls.push(context);
          return { projects: [] };
        },
      },
    });
    const readTool = tools.find((tool) => tool.name === 'praxis_read');

    expect(readTool).toBeDefined();
    const output = await readTool!.call(
      { view: 'overview' },
      undefined as never,
      undefined as never,
      undefined as never,
    );

    expect(calls).toEqual([{
      userId: '42',
      conversationId: 'conversation-1',
    }]);
    expect(output.data).toEqual({
      result: {
        schemaVersion: '1.0.0',
        status: 'available',
        view: 'overview',
        data: { projects: [] },
      },
    });
  });
});
