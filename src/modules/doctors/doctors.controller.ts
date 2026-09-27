import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DoctorsService } from './doctors.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { CreateDoctorDto, UpdateDoctorDto, CreateReviewDto, UpsertScheduleDto } from './dto/doctor.dto.js';

@Controller()
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  // Public search: GET /doctors?specialtyId=&city=&maxPrice=&q=
  @Public()
  @Get('doctors')
  search(
    @Query('specialtyId') specialtyId?: string,
    @Query('city') city?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.doctors.search({
      specialtyId,
      city,
      maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
      q,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('doctors/me')
  @Roles('DOCTOR', 'ADMIN', 'SUPER_ADMIN')
  myProfile(@CurrentUser() user: AuthUser) {
    return this.doctors.myProfile(user.sub);
  }

  /** The doctor's own patients (visit stats + contact). Admins may pass ?doctorId=. */
  @Get('doctors/me/patients')
  @Roles('DOCTOR', 'ADMIN', 'SUPER_ADMIN')
  myPatients(@CurrentUser() user: AuthUser, @Query('doctorId') doctorId?: string) {
    const isAdmin = user.roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));
    return this.doctors.myPatients(user.sub, isAdmin ? doctorId : undefined);
  }

  @Public()
  @Get('doctors/:id')
  profile(@Param('id') id: string): Promise<any> {
    return this.doctors.getProfile(id);
  }

  @Post('doctors')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('doctor:create')
  create(@Body() dto: CreateDoctorDto) {
    return this.doctors.create(dto as any);
  }

  @Patch('doctors/:id')
  @Roles('ADMIN', 'SUPER_ADMIN', 'DOCTOR')
  @RequirePermissions('doctor:update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDoctorDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Doctors edit only their OWN profile; admins edit any.
    const isAdmin = user.roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));
    if (!isAdmin) {
      const ownerId = await this.doctors.ownerOf(id);
      if (!ownerId || ownerId !== user.sub) {
        throw new ForbiddenException('you can only edit your own profile');
      }
    }
    return this.doctors.update(id, dto as any);
  }

  @Delete('doctors/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('doctor:delete')
  remove(@Param('id') id: string) {
    return this.doctors.remove(id);
  }

  @Patch('doctors/:id/verify')
  @Roles('ADMIN', 'SUPER_ADMIN', 'STAFF')
  @RequirePermissions('doctor:verify')
  verify(@Param('id') id: string, @Body() body: { verified: boolean }) {
    return this.doctors.verify(id, body.verified);
  }

  /**
   * Doctor profile photo → Cloudinary (600x600 face-crop).
   * Doctors can only upload to their OWN profile; admins to any.
   * Multipart field name: `photo` (image/*, max 5MB).
   */
  @Post('doctors/:id/photo')
  @Roles('DOCTOR', 'ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('doctor:update')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('only image files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadPhoto(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('photo file is required (field: photo)');
    const isAdmin = user.roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));
    if (!isAdmin) {
      const ownerId = await this.doctors.ownerOf(id);
      if (!ownerId || ownerId !== user.sub) {
        throw new ForbiddenException('you can only upload your own photo');
      }
    }
    return this.doctors.setPhoto(id, { buffer: file.buffer, mimetype: file.mimetype });
  }

  // Doctor manages own schedule: PUT /doctors/:id/schedule
  @Post('doctors/:id/schedule')
  @Roles('DOCTOR', 'ADMIN', 'SUPER_ADMIN')
  setSchedules(@Param('id') id: string, @Body() body: { windows: UpsertScheduleDto[] }) {
    return this.doctors.setSchedules(id, body.windows ?? []);
  }

  @Public()
  @Get('doctors/:id/schedule')
  getSchedules(@Param('id') id: string) {
    return this.doctors.getSchedules(id);
  }

  // Patient rates doctor
  @Post('doctors/:id/reviews')
  @Roles('PATIENT', 'ADMIN', 'SUPER_ADMIN')
  rate(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.doctors.rate(id, user.sub, dto.stars, dto.comment ?? '');
  }

  // Specialties & clinics
  @Public()
  @Get('specialties')
  specialties() {
    return this.doctors.listSpecialties();
  }

  @Post('specialties')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('specialty:manage')
  createSpecialty(@Body() body: { name: string; description?: string; nameAr?: string; descriptionAr?: string }) {
    return this.doctors.createSpecialty(body.name, body.description ?? '', body.nameAr ?? '', body.descriptionAr ?? '');
  }

  /** Edit specialty names/descriptions (used to attach bilingual content to existing rows). */
  @Patch('specialties/:id')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('specialty:manage')
  updateSpecialty(
    @Param('id') id: string,
    @Body() body: { name?: string; nameAr?: string; description?: string; descriptionAr?: string },
  ) {
    return this.doctors.updateSpecialty(id, body);
  }

  @Public()
  @Get('clinics')
  clinics() {
    return this.doctors.listClinics();
  }

  @Post('clinics')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('clinic:manage')
  createClinic(@Body() body: { name: string; city?: string; address?: string; phone?: string }) {
    return this.doctors.createClinic(body as any);
  }
}
