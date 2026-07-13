import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ProposeProfileMemoryDto {
  @IsString()
  @MaxLength(2_000)
  content!: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  slotKey?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  appliesTo?: string[];

  @IsIn(['long_term', 'short_term', 'temporary'])
  timeScope!: 'long_term' | 'short_term' | 'temporary';

  @IsIn(['hard_constraint', 'high', 'normal', 'background'])
  priority!: 'hard_constraint' | 'high' | 'normal' | 'background';

  @IsIn(['L0', 'L1', 'L2', 'L3'])
  level!: 'L0' | 'L1' | 'L2' | 'L3';

  @IsIn(['user_explicit', 'user_confirmed', 'agent_summary', 'multi_conversation_summary'])
  sourceType!: 'user_explicit' | 'user_confirmed' | 'agent_summary' | 'multi_conversation_summary';

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsString()
  sourceConversationId?: string;

  @IsOptional()
  @IsString()
  sourceMessageId?: string;

  @IsString()
  @MaxLength(2_000)
  rationale!: string;
}

export class ProposeBaseProfileDto {
  @IsObject()
  patch!: Record<string, unknown>;

  @IsString()
  @MaxLength(2_000)
  rationale!: string;

  @IsIn(['user_explicit', 'user_confirmed', 'system_correction'])
  sourceType!: 'user_explicit' | 'user_confirmed' | 'system_correction';

  @IsOptional()
  @IsString()
  sourceConversationId?: string;

  @IsOptional()
  @IsString()
  sourceMessageId?: string;
}
