import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  PROFILE_PRODUCT_FIELD_KEYS,
  type ProfileProductFieldKey,
  type ProfileProductValue,
} from '../profile-product.types';

export class MutateProfileProductDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @IsIn(PROFILE_PRODUCT_FIELD_KEYS)
  fieldKey!: ProfileProductFieldKey;

  @IsIn(['set', 'clear', 'add', 'remove'])
  operation!: 'set' | 'clear' | 'add' | 'remove';

  @IsOptional()
  value?: ProfileProductValue;
}
