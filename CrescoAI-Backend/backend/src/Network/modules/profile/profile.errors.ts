import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export function profileValidationError(message: string, details?: unknown) {
  return new BadRequestException({
    code: 'PROFILE_VALIDATION_FAILED',
    message,
    details,
  });
}

export function profileVersionConflict(expected: number, actual: number) {
  return new ConflictException({
    code: 'PROFILE_VERSION_CONFLICT',
    message: 'profile version is stale; reload before retrying',
    expectedVersion: expected,
    actualVersion: actual,
  });
}

export function profileConfirmationRequired(proposalId: string) {
  return new ConflictException({
    code: 'PROFILE_CONFIRMATION_REQUIRED',
    message: 'this profile update requires explicit user confirmation',
    proposalId,
  });
}

export function profileAccessDenied(message = 'profile operation is not allowed') {
  return new ForbiddenException({ code: 'PROFILE_ACCESS_DENIED', message });
}

export function profileResourceNotFound(resource: string, id: string) {
  return new NotFoundException({
    code: 'PROFILE_RESOURCE_NOT_FOUND',
    message: `${resource} ${id} not found`,
  });
}
