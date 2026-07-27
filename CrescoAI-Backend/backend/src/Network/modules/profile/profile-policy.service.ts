import { Injectable } from '@nestjs/common';
import type { ProfileMemoryItemEntity } from './entities/profile-memory-item.entity';
import type { ProfileMemoryCandidate, ProfilePolicyDecision } from './profile-v2.types';

const sensitivePatterns = [
  /\b(?:password|passwd|token|api[_ -]?key|secret)\b/i,
  /\b\d{17}[\dXx]\b/,
  /(?:密码|口令|访问令牌|身份证号|私钥)/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

export function containsSensitiveProfileData(content: string) {
  return sensitivePatterns.some((pattern) => pattern.test(content));
}

@Injectable()
export class ProfilePolicyService {
  evaluateMemory(
    candidate: ProfileMemoryCandidate,
    active: ProfileMemoryItemEntity[],
  ): ProfilePolicyDecision {
    const reasons: string[] = [];
    const content = candidate.content.trim();
    if (!content || candidate.timeScope === 'temporary') {
      return this.decision('L0', 'ignore', ['temporary or empty information'], [], false);
    }
    if (containsSensitiveProfileData(content)) {
      return this.decision('L0', 'ignore', ['sensitive data is not allowed in Profile Memory'], [], false);
    }
    if (candidate.level === 'L0') {
      return this.decision('L0', 'ignore', ['caller classified the information as non-persistent'], [], false);
    }
    if (['identity', 'education', 'base_fact', 'current_status'].includes(candidate.category.trim().toLowerCase())) {
      return this.decision(
        'L3',
        'ignore',
        ['stable base facts must use profile_update with target=basic'],
        [],
        false,
      );
    }
    const conflicts = candidate.slotKey
      ? active.filter((item) =>
          item.slotKey === candidate.slotKey
          && item.content.trim().toLowerCase() !== content.toLowerCase())
      : [];
    const conflictIds = conflicts.map((item) => item.id);
    if (conflictIds.length) reasons.push('candidate conflicts with active profile items');

    if (candidate.priority === 'hard_constraint' || conflictIds.length) {
      return this.decision('L3', 'apply', reasons.length ? reasons : ['hard constraint classified as L3'], conflictIds, false);
    }

    if (candidate.level === 'L3') {
      return this.decision('L3', 'apply', ['caller classified the change as high-impact L3'], [], false);
    }

    if (candidate.level === 'L1') {
      const explicit = candidate.sourceType === 'user_explicit' || candidate.sourceType === 'user_confirmed';
      if (candidate.timeScope !== 'short_term') {
        return this.decision(
          'L2',
          'apply',
          ['L1 is limited to short-term information; risk level was raised to L2'],
          [],
          false,
        );
      }
      if (!explicit) {
        return this.decision(
          'L2',
          'apply',
          ['L1 requires an explicit or confirmed user source; risk level was raised to L2'],
          [],
          false,
        );
      }
      return this.decision('L1', 'apply', ['caller classified explicit low-risk short-term information as L1'], [], false);
    }

    if (candidate.level === 'L2') {
      return this.decision('L2', 'apply', ['caller classified durable information as L2'], [], false);
    }

    return this.decision('L0', 'ignore', ['invalid Profile update level'], [], false);
  }

  private decision(
    level: ProfilePolicyDecision['level'],
    action: ProfilePolicyDecision['action'],
    reasons: string[],
    conflictIds: string[],
    confirmationRequired: boolean,
  ): ProfilePolicyDecision {
    return { level, action, reasons, conflictIds, confirmationRequired };
  }
}
