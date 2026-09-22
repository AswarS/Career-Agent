import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeEduAgentWorldPersona, validateEduAgentWorldPersona } from '../../CrescoAI-Backend/backend/src/Network/modules/training-harness/persona-materializer.ts';

const persona = {
  schema_version: 'eduagentworld.career_agent_persona.v1',
  career_agent_profile_product_schema_version: 'career_profile_product_v2',
  career_agent_reference_revision: 'test',
  base_profile: { name: 'Test User', yearsOfExperience: 3 },
  product_fields: { 'base.name': 'Test User', 'base.yearsOfExperience': 3, 'career.skills': ['SQL'] },
};

test('accepts an EduAgentWorld persona compatible with Profile product v2', () => {
  assert.equal(validateEduAgentWorldPersona(persona).product_fields['base.name'], 'Test User');
});

test('rejects unknown product fields and conflicting base profile facts', () => {
  assert.throws(() => validateEduAgentWorldPersona({ ...persona, product_fields: { 'unknown.field': 'x' } }), /Unsupported/);
  assert.throws(() => validateEduAgentWorldPersona({ ...persona, base_profile: { name: 'Someone Else' } }), /conflicts/);
});

test('materializes every field through the production Product V2 mutation contract', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const fields: Array<{ fieldKey: unknown; value: unknown }> = [];
  const projection = { getProductProfile: async () => ({ version: 0 }) };
  const mutations = {
    mutate: async (_userId: number, input: Record<string, unknown>, actor: Record<string, unknown>) => {
      calls.push({ ...input, actor });
      fields.push({ fieldKey: input.fieldKey, value: input.value });
      return { version: Number(input.expectedVersion) + 1, fields: structuredClone(fields) };
    },
  };
  const view = await materializeEduAgentWorldPersona(42, persona, mutations as never, projection as never);
  assert.equal(view.version, 3);
  assert.deepEqual(calls.map(call => call.fieldKey), ['base.name', 'base.yearsOfExperience', 'career.skills']);
  assert.ok(calls.every(call => call.operation === 'set'));
  assert.ok(calls.every(call => (call.actor as Record<string, unknown>).sourceType === 'user_ui'));
});

test('rejects a persona when the persisted Product V2 projection differs', async () => {
  const projection = { getProductProfile: async () => ({ version: 0 }) };
  const mutations = {
    mutate: async (_userId: number, input: Record<string, unknown>) => ({
      version: Number(input.expectedVersion) + 1,
      field: { fieldKey: input.fieldKey, value: 'wrong' },
    }),
  };
  await assert.rejects(
    materializeEduAgentWorldPersona(42, persona, mutations as never, projection as never),
    /materialization mismatch/,
  );
});
