import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notification, NotificationSchema } from './schemas/notification.schema.js';
import { Appointment, AppointmentSchema } from '../appointments/schemas/appointment.schema.js';
import { NotificationsService } from './notifications.service.js';
import { RemindersService } from './reminders.service.js';
import { NotificationsController } from './notifications.controller.js';
import { MailService } from '../../infra/mail/mail.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, RemindersService, MailService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
