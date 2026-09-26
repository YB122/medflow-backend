import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

/**
 * Login accepts an `identifier` (email or phone). `email` is kept as a
 * deprecated alias so older clients keep working.
 */
export class LoginDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  identifier?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'phone must be 8-15 digits, optional + prefix' })
  phone?: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
