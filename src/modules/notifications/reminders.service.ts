import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Appointment, AppointmentDocument, AppointmentStatus } from '../../modules/appointments/schemas/appointment.schema.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationType } from './schemas/notification.schema.js';

/**
 * Appointment reminders: every 10 minutes, notify patients + doctors
 * about CONFIRMED/PENDING appointments happening tomorrow.
 * Dedupes within process memory (reminded:<appointmentId>:<date>).
 * Runs in-process so booking never waits; RabbitMQ consumers can
 * replace this later without changing the API.
 */
@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);
  private readonly sent = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectModel(Appointment.name) private readonly appts: Model<AppointmentDocument>,
    private readonly notifs: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.DISABLE_REMINDERS === '1') return;
    // First sweep after 30s (lets DB connect), then every 10 min.
    setTimeout(() => this.sweep().catch(() => null), 30_000);
    this.timer = setInterval(() => this.sweep().catch(() => null), 10 * 60_000);
    this.timer.unref?.();
  }

  async sweep(now = new Date()) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    let upcoming: AppointmentDocument[] = [];
    try {
      upcoming = await this.appts
        .find({ date, status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] } })
        .limit(500)
        .exec();
    } catch (e: any) {
      this.logger.warn(`reminder sweep skipped (db?): ${e?.message}`);
      return { checked: 0, reminded: 0 };
    }
    let reminded = 0;
    for (const a of upcoming) {
      const key = `reminded:${String(a._id)}:${a.date}`;
      if (this.sent.has(key)) continue;
      try {
        await this.notifs.create(
          String(a.patientId),
          NotificationType.REMINDER,
          'Appointment reminder',
          `You have an appointment tomorrow ${a.date} at ${a.start}.`,
          String(a._id),
        );
        await this.notifs.create(
          String(a.doctorId),
          NotificationType.REMINDER,
          'Upcoming appointment',
          `Appointment tomorrow ${a.date} at ${a.start}.`,
          String(a._id),
        );
        this.sent.add(key);
        reminded += 1;
      } catch (e: any) {
        this.logger.warn(`reminder for ${String(a._id)} failed: ${e?.message}`);
      }
    }
    if (reminded > 0) this.logger.log(`reminders sent: ${reminded} for ${date}`);
    return { checked: upcoming.length, reminded };
  }
}
