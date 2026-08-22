import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { IntegrationOutboxEntity } from './entities/integration-outbox.entity';

export interface PublicAccountPatch {
  displayName?: string;
  avatarUrl?: string | null;
  accountStatus?: 'active' | 'disabled';
}

export function normalizePublicAvatarUrl(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function applyPublicAccountPatch(
  manager: EntityManager,
  user: UserEntity,
  patch: PublicAccountPatch,
) {
  const displayName = patch.displayName?.trim();
  const nextDisplayName = displayName || user.displayName;
  const nextAvatarUrl = patch.avatarUrl === undefined
    ? normalizePublicAvatarUrl(user.avatarUrl)
    : normalizePublicAvatarUrl(patch.avatarUrl);
  const nextStatus = patch.accountStatus ?? user.accountStatus;
  const displayChanged = nextDisplayName !== user.displayName;
  const avatarChanged = nextAvatarUrl !== (user.avatarUrl ?? null);
  const statusChanged = nextStatus !== user.accountStatus;

  if (!displayChanged && !avatarChanged && !statusChanged) {
    return false;
  }

  const occurredAt = new Date();
  const nextAccountVersion = (user.accountVersion ?? 0) + 1;
  await manager.update(
    UserEntity,
    { id: user.id },
    {
      ...(displayChanged ? { displayName: nextDisplayName } : {}),
      ...(avatarChanged ? { avatarUrl: nextAvatarUrl } : {}),
      ...(statusChanged ? { accountStatus: nextStatus } : {}),
      accountVersion: nextAccountVersion,
    },
  );

  // Keep the caller's entity in sync without saving the whole entity. User
  // instances loaded by public-account flows intentionally omit credentials,
  // so a whole-entity save must never be used here.
  user.displayName = nextDisplayName;
  user.avatarUrl = nextAvatarUrl;
  user.accountStatus = nextStatus;
  user.accountVersion = nextAccountVersion;

  if (statusChanged) {
    await enqueueAccountStatusChanged(
      manager,
      user,
      nextStatus,
      user.accountVersion,
      occurredAt,
    );
  }
  return true;
}

export async function enqueueAccountStatusChanged(
  manager: EntityManager,
  user: UserEntity,
  status: 'active' | 'disabled',
  accountVersion: number,
  occurredAt = new Date(),
) {
  const eventId = randomUUID();
  await manager.insert(IntegrationOutboxEntity, {
    id: eventId,
    eventType: 'account.status.changed',
    aggregateType: 'user',
    aggregateId: user.publicUserId,
    aggregateVersion: accountVersion,
    payloadJson: JSON.stringify({
      eventId,
      eventType: 'account.status.changed',
      externalUserId: user.publicUserId,
      status,
      sourceVersion: String(accountVersion).padStart(20, '0'),
      occurredAt: occurredAt.toISOString(),
    }),
    status: 'pending',
    attempts: 0,
    availableAt: occurredAt,
    publishedAt: null,
    lockToken: null,
    lockedAt: null,
    lastError: null,
  });
}
