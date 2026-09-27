import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { Doctor, DoctorSchema } from '../doctors/schemas/doctor.schema.js';
import { Appointment, AppointmentSchema } from '../appointments/schemas/appointment.schema.js';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema.js';
import { Review, ReviewSchema } from '../doctors/schemas/review.schema.js';
import { Schedule, ScheduleSchema } from '../schedules/schemas/schedule.schema.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Doctor.name, schema: DoctorSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Schedule.name, schema: ScheduleSchema },
    ]),
  ],
  controllers: [AdminController],
})
export class AdminModule {}
