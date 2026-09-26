import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Doctor, DoctorSchema } from './schemas/doctor.schema.js';
import { Specialty, SpecialtySchema } from './schemas/specialty.schema.js';
import { Clinic, ClinicSchema } from './schemas/clinic.schema.js';
import { Review, ReviewSchema } from './schemas/review.schema.js';
import { Schedule, ScheduleSchema } from '../schedules/schemas/schedule.schema.js';
import { DoctorsService } from './doctors.service.js';
import { DoctorsController } from './doctors.controller.js';
import { CloudinaryModule } from '../../infra/cloudinary/cloudinary.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Doctor.name, schema: DoctorSchema },
      { name: Specialty.name, schema: SpecialtySchema },
      { name: Clinic.name, schema: ClinicSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Schedule.name, schema: ScheduleSchema },
    ]),
    CloudinaryModule,
  ],
  controllers: [DoctorsController],
  providers: [DoctorsService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
