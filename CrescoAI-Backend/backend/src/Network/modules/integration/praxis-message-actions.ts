import {
  PRAXIS_LAUNCH_ACTION_KIND,
  PRAXIS_TOOL_SCHEMA_VERSION,
} from './praxis.tools.js';

export interface PraxisActionSourceBlock {
  id: string;
  type: string;
  text?: string;
  toolUseId?: string | null;
  isError?: boolean;
}

export interface PraxisLaunchMessageAction {
  id: string;
  kind: typeof PRAXIS_LAUNCH_ACTION_KIND;
  label: '打开 Praxis';
  destination: 'home';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePraxisLaunchResult(text: string | undefined) {
  if (!text?.trim()) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || value.schemaVersion !== PRAXIS_TOOL_SCHEMA_VERSION) {
      return null;
    }
    if (value.status !== 'ready' || !isRecord(value.uiAction)) {
      return null;
    }
    if (
      value.uiAction.kind !== PRAXIS_LAUNCH_ACTION_KIND
      || value.uiAction.destination !== 'home'
      || value.uiAction.label !== '打开 Praxis'
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function extractPraxisMessageActions(
  blocks: PraxisActionSourceBlock[] | null | undefined,
): PraxisLaunchMessageAction[] {
  const actions: PraxisLaunchMessageAction[] = [];
  const seen = new Set<string>();

  for (const block of blocks ?? []) {
    if (block.type !== 'tool_result' || block.isError === true) continue;
    if (!parsePraxisLaunchResult(block.text)) continue;

    const sourceId = block.toolUseId?.trim() || block.id;
    const id = `action-launch-praxis-${sourceId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    actions.push({
      id,
      kind: PRAXIS_LAUNCH_ACTION_KIND,
      label: '打开 Praxis',
      destination: 'home',
    });
  }

  return actions;
}
