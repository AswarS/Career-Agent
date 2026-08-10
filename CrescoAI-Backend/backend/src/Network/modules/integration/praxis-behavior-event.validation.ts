import { BadRequestException } from '@nestjs/common';
import {
  PRAXIS_BEHAVIOR_EVENT_TYPES,
  PRAXIS_BEHAVIOR_RESOURCE_TYPES,
  PRAXIS_BEHAVIOR_SCHEMA_VERSION,
  type PraxisBehaviorEvent,
} from './praxis-behavior-event.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^pbe_[A-Za-z0-9_-]+$/;
const LOWER_TOKEN_PATTERN = /^[a-z][a-z0-9_]{1,99}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,99}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const TOP_LEVEL_KEYS = new Set([
  'eventId', 'schemaVersion', 'eventType', 'externalUserId', 'actorType',
  'occurredAt', 'traceId', 'sourceSystem', 'sourceEventId', 'outcome',
  'resourceRefs', 'facts',
]);
const REQUIRED_TOP_LEVEL_KEYS = [
  'eventId', 'schemaVersion', 'eventType', 'externalUserId', 'actorType',
  'occurredAt', 'traceId', 'sourceSystem', 'outcome', 'resourceRefs', 'facts',
] as const;
const FACT_KEYS = new Set([
  'mode', 'status', 'decision', 'scopeKind', 'attemptNumber',
  'remainingAttempts', 'score', 'completeness', 'fileCount', 'durationMs',
  'errorCode', 'contentHash',
]);

function invalid(message: string): never {
  throw new BadRequestException({
    code: 'BEHAVIOR_EVENT_INVALID',
    message,
  });
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  name: string,
) {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) invalid(`${name} contains unsupported field ${unexpected}.`);
}

function string(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    invalid(`${name} must contain between ${minimum} and ${maximum} characters.`);
  }
  return value;
}

function integer(
  value: unknown,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum
    || (value as number) > maximum) {
    invalid(`${name} is outside the supported integer range.`);
  }
  return value as number;
}

export function validatePraxisBehaviorEvent(input: unknown): PraxisBehaviorEvent {
  const event = object(input, 'request body');
  exactKeys(event, TOP_LEVEL_KEYS, 'request body');
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in event)) invalid(`request body is missing ${key}.`);
  }

  const eventId = string(event.eventId, 'eventId', 5, 200);
  if (!EVENT_ID_PATTERN.test(eventId)) invalid('eventId has an invalid format.');
  if (event.schemaVersion !== PRAXIS_BEHAVIOR_SCHEMA_VERSION) {
    invalid(`schemaVersion must be ${PRAXIS_BEHAVIOR_SCHEMA_VERSION}.`);
  }
  if (!PRAXIS_BEHAVIOR_EVENT_TYPES.includes(event.eventType as never)) {
    invalid('eventType is not part of the closed behavior contract.');
  }
  const externalUserId = string(event.externalUserId, 'externalUserId', 36, 36);
  if (!UUID_PATTERN.test(externalUserId)) invalid('externalUserId must be a UUID.');
  if (!['authenticated_user', 'publisher', 'agent', 'system'].includes(
    String(event.actorType),
  )) invalid('actorType is invalid.');
  const occurredAt = string(event.occurredAt, 'occurredAt', 20, 40);
  if (!DATE_TIME_PATTERN.test(occurredAt) || Number.isNaN(Date.parse(occurredAt))) {
    invalid('occurredAt must be an RFC 3339 date-time.');
  }
  string(event.traceId, 'traceId', 5, 200);
  if (event.sourceSystem !== 'praxis') invalid('sourceSystem must be praxis.');
  if ('sourceEventId' in event) {
    string(event.sourceEventId, 'sourceEventId', 5, 200);
  }
  if (!['accepted', 'succeeded', 'failed', 'rejected'].includes(
    String(event.outcome),
  )) invalid('outcome is invalid.');

  if (!Array.isArray(event.resourceRefs) || event.resourceRefs.length > 10) {
    invalid('resourceRefs must contain at most 10 entries.');
  }
  const resourceKeys = new Set<string>();
  for (const [index, rawResource] of event.resourceRefs.entries()) {
    const resource = object(rawResource, `resourceRefs[${index}]`);
    exactKeys(
      resource,
      new Set(['resourceType', 'resourceId']),
      `resourceRefs[${index}]`,
    );
    if (Object.keys(resource).length !== 2
      || !PRAXIS_BEHAVIOR_RESOURCE_TYPES.includes(resource.resourceType as never)) {
      invalid(`resourceRefs[${index}] is invalid.`);
    }
    const resourceId = string(
      resource.resourceId,
      `resourceRefs[${index}].resourceId`,
      5,
      100,
    );
    const key = `${String(resource.resourceType)}\u0000${resourceId}`;
    if (resourceKeys.has(key)) invalid('resourceRefs must be unique.');
    resourceKeys.add(key);
  }

  const facts = object(event.facts, 'facts');
  exactKeys(facts, FACT_KEYS, 'facts');
  if ('mode' in facts && !['SELF', 'PUBLISHED'].includes(String(facts.mode))) {
    invalid('facts.mode is invalid.');
  }
  for (const key of ['status', 'decision'] as const) {
    if (key in facts && (typeof facts[key] !== 'string'
      || !LOWER_TOKEN_PATTERN.test(facts[key] as string))) {
      invalid(`facts.${key} is invalid.`);
    }
  }
  if ('scopeKind' in facts && ![
    'project_material', 'profile', 'node_draft', 'submission',
  ].includes(String(facts.scopeKind))) invalid('facts.scopeKind is invalid.');
  if ('attemptNumber' in facts) integer(facts.attemptNumber, 'facts.attemptNumber', 1);
  if ('remainingAttempts' in facts) integer(facts.remainingAttempts, 'facts.remainingAttempts', 0);
  if ('score' in facts) integer(facts.score, 'facts.score', 0, 100);
  if ('completeness' in facts) integer(facts.completeness, 'facts.completeness', 0, 100);
  if ('fileCount' in facts) integer(facts.fileCount, 'facts.fileCount', 0, 20);
  if ('durationMs' in facts) integer(facts.durationMs, 'facts.durationMs', 0);
  if ('errorCode' in facts && (typeof facts.errorCode !== 'string'
    || !ERROR_CODE_PATTERN.test(facts.errorCode))) {
    invalid('facts.errorCode is invalid.');
  }
  if ('contentHash' in facts && (typeof facts.contentHash !== 'string'
    || !HASH_PATTERN.test(facts.contentHash))) {
    invalid('facts.contentHash is invalid.');
  }

  return event as unknown as PraxisBehaviorEvent;
}
