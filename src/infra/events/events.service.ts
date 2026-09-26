import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Thin event bus for appointment domain events.
 * - Tries RabbitMQ (amqplib) if RABBITMQ_URL is set; otherwise in-memory fallback.
 * - Booking never waits for email: consumers handle notification + mail async.
 *
 * Exchange: medflow.appointments (topic)
 * Keys: appointment.booked | appointment.approved | appointment.cancelled
 */
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);
  private channel: any = null;
  private readonly handlers = new Map<string, Array<(payload: any) => Promise<void> | void>>();

  async onModuleInit() {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      this.logger.log('RABBITMQ_URL not set — using in-memory events');
      return;
    }
    try {
      // Dynamic import so the service boots even without amqplib installed.
      const amqp: any = await import('amqplib').catch(() => null);
      if (!amqp) {
        this.logger.warn('amqplib not installed — using in-memory events');
        return;
      }
      const conn = await amqp.connect(url);
      this.channel = await conn.createChannel();
      await this.channel.assertExchange('medflow.appointments', 'topic', { durable: true });
      this.logger.log('connected to RabbitMQ');
    } catch (e: any) {
      this.logger.warn(`rabbitmq unavailable, fallback to memory: ${e?.message}`);
      this.channel = null;
    }
  }

  on(key: string, handler: (payload: any) => Promise<void> | void) {
    const list = this.handlers.get(key) ?? [];
    list.push(handler);
    this.handlers.set(key, list);
  }

  private async dispatch(key: string, payload: any) {
    // In-memory consumers always run (notification + mail services subscribe here).
    for (const h of this.handlers.get(key) ?? []) {
      try {
        await h(payload);
      } catch (e: any) {
        this.logger.warn(`handler for ${key} failed: ${e?.message}`);
      }
    }
    // Also publish to RabbitMQ when available (other services can consume).
    if (this.channel) {
      try {
        this.channel.publish('medflow.appointments', key, Buffer.from(JSON.stringify(payload)), {
          persistent: true,
        });
      } catch (e: any) {
        this.logger.warn(`publish ${key} failed: ${e?.message}`);
      }
    }
  }

  emitAppointmentBooked(payload: { appointmentId: string; doctorId: string; patientId: string; date: string; start: string }) {
    return this.dispatch('appointment.booked', payload);
  }
  emitAppointmentApproved(payload: { appointmentId: string; patientId: string; doctorId: string }) {
    return this.dispatch('appointment.approved', payload);
  }
  emitAppointmentCancelled(payload: { appointmentId: string; patientId: string; doctorId: string; reason?: string }) {
    return this.dispatch('appointment.cancelled', payload);
  }
}
