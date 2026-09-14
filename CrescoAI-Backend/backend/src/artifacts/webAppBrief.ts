import { z } from 'zod/v4'

import { APP_EVENT_TYPE_PATTERN, APP_SLUG_PATTERN } from './webAppManifest.js'

const boundedText = z.string().trim().min(1)

export const webAppVersioningSchema = z.strictObject({
  logical_object_type: z.literal('web_app'),
  logical_object_id: boundedText,
  version: z.number().int().positive(),
  previous_artifact_ref: boundedText,
})

export const webAppBriefSchema = z.strictObject({
  schema: z.literal('multi-agent-app-brief/1.0'),
  invocation: z.strictObject({
    requestedBy: z.literal('app-coordinator'),
    reason: boundedText,
  }),
  user: z.strictObject({
    audience: boundedText,
    level: boundedText,
    constraints: z.array(z.string()).max(32),
  }),
  goal: z.strictObject({
    outcome: boundedText,
    successCriteria: z.array(boundedText).min(1).max(32),
  }),
  content: z.strictObject({
    domain: boundedText,
    required: z.array(boundedText).min(1).max(64),
    excluded: z.array(z.string()).max(64),
    sourceNotes: z.array(z.string()).max(64),
  }),
  experience: z.strictObject({
    scene: z.enum(['visualize', 'simulate', 'practice', 'workspace']),
    primaryLoop: boundedText,
    requiredInteractions: z.array(boundedText).min(1).max(64),
    completionState: boundedText,
  }),
  adaptation: z.strictObject({
    signals: z.array(z.string()).max(64),
    allowedResponses: z.array(z.string()).max(64),
    forbiddenInferences: z.array(z.string()).max(64),
  }),
  telemetry: z.strictObject({
    events: z.array(z.string().regex(APP_EVENT_TYPE_PATTERN)).max(64),
    agentQuestions: z.array(boundedText).max(16),
    retention: z.literal('local-session'),
    upload: z.strictObject({ endpoint: z.literal('./events') }).optional(),
  }),
  delivery: z.strictObject({
    title: boundedText,
    slug: z.string().regex(APP_SLUG_PATTERN).optional(),
    language: z.string().trim().min(2).max(35),
    offline: z.literal(true),
  }),
  versioning: webAppVersioningSchema.optional(),
})

/**
 * Tool-call compatibility wrapper for providers that JSON-encode a nested
 * object argument as a string. The advertised JSON Schema remains the strict
 * App Brief object, while runtime validation safely decodes the string before
 * applying the canonical schema.
 */
export const webAppBriefToolInputSchema = z.preprocess(value => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}, webAppBriefSchema)

export type WebAppBrief = z.infer<typeof webAppBriefSchema>
