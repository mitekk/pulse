import { IsString } from 'class-validator';

export class MarkReadDto {
  @IsString()
  lastReadMessageId!: string;
}
