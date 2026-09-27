import { Injectable, Logger } from '@nestjs/common';

/**
 * In-memory event bus for appointment domain events.
 * Booking never waits for email: consumers (notifications + mail)
 * handle events asynchronously after the HTTP response is sent.
 *
 * Keys: appointment.booked | appointment.approved | appointment.cancelled
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly handlers = new Map<string, Array<(payload: any) => Promise<void> | void>>();

  on(key: string, handler: (payload: any) => Promise<void> | void) {
    const list = this.handlers.get(key) ?? [];
    list.push(handler);
    this.handlers.set(key, list);
  }

  private async dispatch(key: string, payload: any) {
    for (const h of this.handlers.get(key) ?? []) {
      try {
        await h(payload);
      } catch (e: any) {
        this.logger.warn(`handler for ${key} failed: ${e?.message}`);
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
