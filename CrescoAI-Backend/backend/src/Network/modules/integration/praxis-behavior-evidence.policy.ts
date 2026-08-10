import type {
  PraxisBehaviorEvent,
  PraxisBehaviorEvidenceCategory,
  PraxisBehaviorEvidenceDisposition,
} from './praxis-behavior-event.types';

const REVIEW_SIGNAL_CATEGORIES: Partial<Record<
  PraxisBehaviorEvent['eventType'],
  PraxisBehaviorEvidenceCategory
>> = {
  'profile.complete': 'profile_completion',
  'run.complete': 'training_progress',
  'coaching.complete': 'learning_progress',
  'node.pass': 'learning_progress',
  'evaluation.complete': 'assessment_result',
  'final_assessment.complete': 'assessment_result',
  'certificate.issue': 'credential_achievement',
  'certificate.publish': 'credential_achievement',
};

export interface PraxisBehaviorEvidenceDecision {
  disposition: PraxisBehaviorEvidenceDisposition;
  category: PraxisBehaviorEvidenceCategory | null;
  reason: string;
}

/**
 * Classify a closed Praxis fact as an audit record or a possible Profile
 * review signal. A signal is deliberately not a Profile mutation: the event
 * contract has no human-readable skill, goal, preference, or constraint value
 * that Career can safely write to Profile V2.
 */
export function classifyPraxisBehaviorEvidence(
  event: PraxisBehaviorEvent,
): PraxisBehaviorEvidenceDecision {
  if (event.outcome !== 'accepted' && event.outcome !== 'succeeded') {
    return {
      disposition: 'audit_only',
      category: null,
      reason: 'unsuccessful_outcome',
    };
  }
  const category = REVIEW_SIGNAL_CATEGORIES[event.eventType];
  if (!category) {
    return {
      disposition: 'audit_only',
      category: null,
      reason: 'event_not_profile_relevant',
    };
  }
  return {
    disposition: 'profile_review_signal',
    category,
    reason: 'closed_fact_requires_grounded_profile_review',
  };
}
