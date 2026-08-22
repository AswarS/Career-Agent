import type { JsonValue, SkillOutcome } from "./skillLifecycleTypes.js";

export type SkillResultValidationInput = {
  skillName: string;
  outcome: SkillOutcome;
  result?: JsonValue;
};

export type SkillResultValidation = { ok: true } | { ok: false; error: string };

export type SkillResultValidator = (
  input: SkillResultValidationInput,
) => SkillResultValidation | Promise<SkillResultValidation>;

const validators = new Map<string, SkillResultValidator>();

export function registerSkillResultValidator(
  skillName: string,
  validator: SkillResultValidator,
): void {
  validators.set(skillName, validator);
}

export async function validateSkillResultContract(
  input: SkillResultValidationInput,
): Promise<SkillResultValidation> {
  return (await validators.get(input.skillName)?.(input)) ?? { ok: true };
}

export function resetSkillResultValidatorsForTests(): void {
  validators.clear();
}
