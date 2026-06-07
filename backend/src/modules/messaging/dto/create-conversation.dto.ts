import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  recipientHandle!: string;
}
