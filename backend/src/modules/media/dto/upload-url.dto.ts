import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';
import type { MediaType } from '../media.entity';

export class UploadUrlDto {
  @IsIn(['image', 'gif', 'video'])
  type!: MediaType;

  @IsString()
  mime!: string;

  /** File size in bytes */
  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024) // 100 MB upper guard; enforced per-type below
  size!: number;
}
