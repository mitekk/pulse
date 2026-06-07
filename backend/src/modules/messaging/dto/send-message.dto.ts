import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  text?: string;

  @IsOptional()
  @IsString()
  mediaId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  clientNonce!: string;
}
