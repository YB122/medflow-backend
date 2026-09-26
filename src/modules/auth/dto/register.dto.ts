import { IsEmail, IsOptional, IsString, Matches, MinLength, MaxLength } from 'class-validator';

/** At least one of `email` / `phone` is required (enforced in AuthService). */
export class RegisterDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'phone must be 8-15 digits, optional + prefix' })
  phone?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
