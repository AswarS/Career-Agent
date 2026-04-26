import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class SendMultimodalMessageDto {
  @IsOptional()
  @IsString()
  kind?: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_asset_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentAssetIds?: string[];

  @IsOptional()
  @IsString()
  client_request_id?: string;

  @IsOptional()
  @IsString()
  clientRequestId?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
