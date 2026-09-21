export const PRAXIS_BEHAVIOR_SCHEMA_VERSION = '1.12.0' as const;

export const PRAXIS_BEHAVIOR_EVENT_TYPES = [
  'auth.login', 'auth.logout',
  'project.create', 'project.update', 'project.publish',
  'invitation.create', 'invitation.accept', 'invitation.disable',
  'run.create', 'run.complete', 'run.end_with_issue',
  'plan.generate', 'plan.review.approve', 'plan.node.regenerate',
  'profile.interview.start', 'profile.answer.submit', 'profile.complete',
  'profile.insufficient',
  'profile.supplement.request', 'profile.material.attach',
  'file.upload.request', 'file.upload.confirm', 'file.scan', 'file.parse',
  'file.read', 'file.download',
  'conversation.create', 'conversation.message.send',
  'conversation.message.ready', 'conversation.archive',
  'precheck.request', 'precheck.complete',
  'submission.accept', 'submission.revise',
  'evaluation.start', 'evaluation.complete',
  'node.pass', 'node.revision_require', 'node.block',
  'attempt.grant', 'attempt.deny',
  'final_assessment.complete', 'final_review.submit', 'final_review.return',
  'report.generate', 'report.download',
  'certificate.issue', 'certificate.publish', 'certificate.verify',
  'certificate.download',
] as const;

export type PraxisBehaviorEventType =
  typeof PRAXIS_BEHAVIOR_EVENT_TYPES[number];
export type PraxisBehaviorActorType =
  'authenticated_user' | 'publisher' | 'agent' | 'system';
export type PraxisBehaviorOutcome =
  'accepted' | 'succeeded' | 'failed' | 'rejected';

export const PRAXIS_BEHAVIOR_RESOURCE_TYPES = [
  'Conversation', 'ConversationMessage',
  'Project', 'ProjectVersion', 'Invitation', 'ProjectRun', 'ProfileSession',
  'FileAsset', 'NodeRun', 'PrecheckResult', 'Submission', 'EvaluationResult',
  'FinalAssessment', 'ReviewReport', 'Certificate', 'AsyncJob',
] as const;

export type PraxisBehaviorResourceType =
  typeof PRAXIS_BEHAVIOR_RESOURCE_TYPES[number];

export interface PraxisBehaviorEvent {
  eventId: string;
  schemaVersion: typeof PRAXIS_BEHAVIOR_SCHEMA_VERSION;
  eventType: PraxisBehaviorEventType;
  externalUserId: string;
  actorType: PraxisBehaviorActorType;
  occurredAt: string;
  traceId: string;
  sourceSystem: 'praxis';
  sourceEventId?: string;
  outcome: PraxisBehaviorOutcome;
  resourceRefs: Array<{
    resourceType: PraxisBehaviorResourceType;
    resourceId: string;
  }>;
  facts: {
    mode?: 'SELF' | 'PUBLISHED';
    status?: string;
    decision?: string;
    scopeKind?: 'project_material' | 'profile' | 'node_draft' | 'submission';
    attemptNumber?: number;
    remainingAttempts?: number;
    score?: number;
    completeness?: number;
    fileCount?: number;
    durationMs?: number;
    errorCode?: string;
    contentHash?: string;
  };
}

export type PraxisBehaviorEvidenceDisposition =
  'audit_only' | 'profile_review_signal';

export type PraxisBehaviorEvidenceCategory =
  | 'profile_completion'
  | 'training_progress'
  | 'learning_progress'
  | 'assessment_result'
  | 'credential_achievement';
