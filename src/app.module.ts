import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from './common/guards/throttle.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { DoctorsModule } from './modules/doctors/doctors.module.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { MedicalModule } from './modules/medical/medical.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { EventsModule } from './infra/events/events.module.js';
import { HealthController } from './modules/health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    MongooseModule.forRoot(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/medflow'),
    RedisModule,
    EventsModule,
    UsersModule,
    AuthModule,
    DoctorsModule,
    AppointmentsModule,
    MedicalModule,
    NotificationsModule,
    ChatModule,
    PaymentsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
