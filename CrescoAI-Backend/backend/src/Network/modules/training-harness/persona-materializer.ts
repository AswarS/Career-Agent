import {
  getProfileProductFieldDefinition,
  listProfileProductFieldDefinitions,
  normalizeProfileProductValue,
} from '../profile/profile-product-field.registry.js';
import type { ProfileProductMutationService } from '../profile/profile-product-mutation.service.js';
import type { ProfileProductProjectionService } from '../profile/profile-product-projection.service.js';
import {
  PROFILE_PRODUCT_SCHEMA_VERSION,
  type ProfileProductFieldKey,
  type ProfileProductValue,
} from '../profile/profile-product.types.js';

const PERSONA_SCHEMA_VERSION = 'eduagentworld.career_agent_persona.v1';

type UnknownRecord = Record<string, unknown>;

export interface EduAgentWorldPersona extends UnknownRecord {
  schema_version: typeof PERSONA_SCHEMA_VERSION;
  career_agent_profile_product_schema_version: typeof PROFILE_PRODUCT_SCHEMA_VERSION;
  base_profile: UnknownRecord;
  product_fields: Record<ProfileProductFieldKey, ProfileProductValue>;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEduAgentWorldPersona(value: unknown): value is EduAgentWorldPersona {
  return isRecord(value) && value.schema_version === PERSONA_SCHEMA_VERSION;
}

export function validateEduAgentWorldPersona(value: unknown): EduAgentWorldPersona {
  if (!isEduAgentWorldPersona(value)
    || value.career_agent_profile_product_schema_version !== PROFILE_PRODUCT_SCHEMA_VERSION
    || !isRecord(value.base_profile)
    || !isRecord(value.product_fields)) {
    throw new Error('Invalid EduAgentWorld Career-Agent persona envelope');
  }

  const known = new Set(listProfileProductFieldDefinitions().map(({ fieldKey }) => fieldKey));
  const fields = Object.entries(value.product_fields);
  if (!fields.length) throw new Error('EduAgentWorld persona has no product fields');
  for (const [fieldKey, fieldValue] of fields) {
    const definition = getProfileProductFieldDefinition(fieldKey);
    if (!known.has(fieldKey as ProfileProductFieldKey) || !definition) {
      throw new Error(`Unsupported Profile product field: ${fieldKey}`);
    }
    normalizeProfileProductValue(definition, fieldValue);
  }

  const base = value.base_profile;
  const directChecks: Array<[string, string]> = [
    ['name', 'base.name'],
    ['currentRole', 'base.currentRole'],
    ['currentCity', 'base.currentCity'],
    ['currentStatus', 'base.currentStatus'],
    ['currentIndustry', 'base.currentIndustry'],
    ['yearsOfExperience', 'base.yearsOfExperience'],
    ['educationLevel', 'base.educationLevel'],
  ];
  for (const [baseKey, productKey] of directChecks) {
    if (base[baseKey] !== undefined
      && JSON.stringify(base[baseKey]) !== JSON.stringify(value.product_fields[productKey as ProfileProductFieldKey])) {
      throw new Error(`Persona base_profile.${baseKey} conflicts with product_fields.${productKey}`);
    }
  }
  return value;
}

export async function materializeEduAgentWorldPersona(
  userId: number,
  input: unknown,
  mutations: ProfileProductMutationService,
  projection: ProfileProductProjectionService,
) {
  const persona = validateEduAgentWorldPersona(input);
  let view = await projection.getProductProfile(userId);
  for (const definition of listProfileProductFieldDefinitions()) {
    if (!Object.prototype.hasOwnProperty.call(persona.product_fields, definition.fieldKey)) continue;
    view = await mutations.mutate(userId, {
      expectedVersion: view.version,
      fieldKey: definition.fieldKey,
      operation: 'set',
      value: persona.product_fields[definition.fieldKey as keyof typeof persona.product_fields],
    }, {
      actorType: 'user',
      sourceType: 'user_ui',
    });
  }
  for (const definition of listProfileProductFieldDefinitions()) {
    if (!Object.prototype.hasOwnProperty.call(persona.product_fields, definition.fieldKey)) continue;
    const expected = normalizeProfileProductValue(
      definition,
      persona.product_fields[definition.fieldKey as keyof typeof persona.product_fields],
    );
    const actual = findProjectedValue(view, definition.fieldKey);
    if (actual === undefined || JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Profile product materialization mismatch: ${definition.fieldKey}`);
    }
  }
  return view;
}

function findProjectedValue(value: unknown, fieldKey: ProfileProductFieldKey): ProfileProductValue | undefined {
  if (!isRecord(value)) return undefined;
  if (value.fieldKey === fieldKey && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value as ProfileProductValue;
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findProjectedValue(item, fieldKey);
        if (found !== undefined) return found;
      }
    } else {
      const found = findProjectedValue(child, fieldKey);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
