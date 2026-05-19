import { IsString } from 'class-validator';

export class RegisterSkillDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;
}
