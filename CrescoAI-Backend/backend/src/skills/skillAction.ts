import { getProjectRoot } from "../bootstrap/state.js";
import { findCommand, getCommands } from "../commands.js";
import type { CanUseToolFn } from "../hooks/useCanUseTool.js";
import type { ToolUseContext } from "../Tool.js";
import type { CommandBase, PromptCommand } from "../types/command.js";
import {
  executeForkedPromptSkill,
  type CompletedSkillAction,
} from "./forkedSkillExecutor.js";
import type { JsonValue } from "./skillLifecycleTypes.js";
import { createRestrictedSkillActionCanUseTool } from "./skillActionIsolation.js";
import type { Tool } from "../Tool.js";

function allowedToolName(rule: string): string | null {
  return rule.trim().match(/^([A-Za-z0-9_.:-]+)/)?.[1] ?? null;
}

/**
 * Prompt Skill allowed-tools historically grants permission but does not make
 * deferred tools visible to the model. Action Skills need their declared
 * tools available on the first child turn; otherwise a model may repeatedly
 * fall back to an always-loaded shell tool. The proxy changes only the
 * child-facing deferral hint and leaves the shared Tool definition untouched.
 */
export function preloadSkillActionTools(
  tools: readonly Tool[],
  allowedTools: readonly string[],
): Tool[] {
  const names = new Set(
    allowedTools
      .map(allowedToolName)
      .filter((name): name is string => Boolean(name)),
  );
  return tools.map((tool) =>
    names.has(tool.name) && tool.alwaysLoad !== true
      ? new Proxy(tool, {
          get(target, property, receiver) {
            if (property === "alwaysLoad") return true;
            return Reflect.get(target, property, receiver);
          },
        })
      : tool,
  );
}

export async function getSkillActionCommand(
  skillName: string,
): Promise<CommandBase & PromptCommand> {
  const commands = await getCommands(getProjectRoot());
  const command = findCommand(skillName, commands);
  if (!command || command.type !== "prompt") {
    throw new Error(`${skillName} Skill is not registered`);
  }
  if (command.modelEntry !== "action-tool") {
    throw new Error(
      `${skillName} Skill is not configured for action-tool entry`,
    );
  }
  return command;
}

export async function executeSkillAction(input: {
  skillName: string;
  actionInput?: JsonValue;
  context: ToolUseContext;
  canUseTool: CanUseToolFn;
}): Promise<CompletedSkillAction> {
  const command = await getSkillActionCommand(input.skillName);
  const restrictedCanUseTool = createRestrictedSkillActionCanUseTool(
    input.canUseTool,
  );
  const actionContext: ToolUseContext = {
    ...input.context,
    options: {
      ...input.context.options,
      tools: preloadSkillActionTools(
        input.context.options.tools,
        command.allowedTools ?? [],
      ),
    },
  };
  const execution = await executeForkedPromptSkill({
    command,
    commandName: input.skillName,
    actionInput: input.actionInput,
    contextMode: "fork",
    requireCompletion: true,
    context: actionContext,
    canUseTool: restrictedCanUseTool,
  });
  if (!execution.completion) {
    throw new Error(`${input.skillName} did not produce a lifecycle result`);
  }
  return execution.completion;
}
