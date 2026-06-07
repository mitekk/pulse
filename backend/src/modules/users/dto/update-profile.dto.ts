import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, IsUUID, MaxLength } from 'class-validator';

/**
 * UpdateProfileDto — PATCH /api/v1/users/me request body.
 * All fields are optional; only provided fields are updated.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  location?: string;

  @IsOptional()
  @IsUrl({}, { message: 'website must be a valid URL' })
  website?: string;

  @IsOptional()
  @IsUUID()
  avatarMediaId?: string;

  @IsOptional()
  @IsUUID()
  bannerMediaId?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;

  @IsOptional()
  @IsIn(['everyone', 'following'])
  dmPrivacy?: 'everyone' | 'following';
}
