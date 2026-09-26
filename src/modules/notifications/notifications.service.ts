import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument, NotificationType } from './schemas/notification.schema.js';
import { EventsService } from '../../infra/events/events.service.js';
import { MailService } from '../../infra/mail/mail.service.js';

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    @InjectModel(Notification.name) private notifs: Model<NotificationDocument>,
    private readonly events: EventsService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    // Async consumers: booking flow already returned to the patient.
    this.events.on('appointment.booked', async (p) => {
      await this.create(p.patientId, NotificationType.BOOKED, 'Appointment booked', `Your slot ${p.date} ${p.start} is pending approval.`, p.appointmentId);
      await this.create(p.doctorId, NotificationType.BOOKED, 'New booking request', `${p.date} ${p.start} needs review.`, p.appointmentId);
      await this.mail.send('patient@local', 'Appointment booked', `Slot ${p.date} ${p.start}`);
    });
    this.events.on('appointment.approved', async (p) => {
      if (p?.patientId) {
        await this.create(p.patientId, NotificationType.APPROVED, 'Appointment approved', `Appointment ${p.appointmentId} confirmed.`, p.appointmentId);
      }
    });
    this.events.on('appointment.cancelled', async (p) => {
      if (p?.patientId) {
        await this.create(p.patientId, NotificationType.CANCELLED, 'Appointment cancelled', `Appointment ${p.appointmentId} cancelled.`, p.appointmentId);
      }
      if (p?.doctorId) {
        await this.create(p.doctorId, NotificationType.CANCELLED, 'Appointment cancelled', `Appointment ${p.appointmentId} cancelled.`, p.appointmentId);
      }
    });
  }

  create(userId: string, type: NotificationType, title: string, body: string, appointmentId?: string) {
    if (!userId) return Promise.resolve(null);
    return this.notifs.create({ userId, type, title, body, appointmentId });
  }

  list(userId: string, onlyUnread = false, page = 1, limit = 20) {
    const where: any = { userId };
    if (onlyUnread) where.read = false;
    return this.paginate(where, page, limit);
  }

  async markRead(userId: string, id: string) {
    await this.notifs.updateOne({ _id: id, userId }, { $set: { read: true } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.notifs.updateMany({ userId, read: false }, { $set: { read: true } });
    return { ok: true };
  }

  private async paginate(where: any, page: number, limit: number) {
    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(100, Math.max(1, limit || 20));
    const [items, total] = await Promise.all([
      this.notifs
        .find(where)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.notifs.countDocuments(where),
    ]);
    return { items, total, page: safePage, limit: safeLimit };
  }
}
