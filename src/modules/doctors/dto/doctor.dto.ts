import { IsMongoId, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateDoctorDto {
  @IsMongoId()
  userId!: string;

  @IsOptional()
  @IsMongoId()
  specialtyId?: string;

  @IsOptional()
  @IsMongoId()
  clinicId?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  city?: string;
}

export class UpdateDoctorDto {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsMongoId()
  specialtyId?: string;

  @IsOptional()
  @IsMongoId()
  clinicId?: string;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(80)
  yearsOfExperience?: number;
}

export class CreateReviewDto {
  @IsNumber()
  @Min(1)
  stars!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class UpsertScheduleDto {
  @IsNumber()
  @Min(0)
  dayOfWeek!: number;

  @IsString()
  start!: string;

  @IsString()
  end!: string;

  @IsOptional()
  @IsNumber()
  slotMinutes?: number;
}
