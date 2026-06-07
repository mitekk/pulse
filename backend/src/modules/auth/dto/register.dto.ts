import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  /**
   * handle: 1–30 chars, alphanumeric + underscores only.
   * Stored case-insensitively (citext) but displayed as-entered.
   */
  @IsString()
  @Length(1, 30)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'handle may only contain letters, numbers, and underscores',
  })
  handle!: string;

  /** Password: min 8 chars */
  @IsString()
  @Length(8, 128)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  displayName?: string;
}
