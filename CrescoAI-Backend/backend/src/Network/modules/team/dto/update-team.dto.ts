import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateTeamDto } from './create-team.dto';

export class UpdateTeamDto extends PartialType(
  OmitType(CreateTeamDto, ['name'] as const)
) {}
