import { IsString, Length } from 'class-validator';

export class LoginDto {
  /** Can be either the user's email address or their @handle */
  @IsString()
  @Length(1, 256)
  emailOrHandle!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
