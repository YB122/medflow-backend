import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Appointment, AppointmentDocument, AppointmentStatus } from './schemas/appointment.schema.js';
import { Schedule, ScheduleDocument } from '../schedules/schemas/schedule.schema.js';
import { EventsService } from '../../infra/events/events.service.js';

export const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export const toHHmm = (mins: number): string =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectModel(Appointment.name) private appts: Model<AppointmentDocument>,
    @InjectModel(Schedule.name) private schedules: Model<ScheduleDocument>,
    private readonly events: EventsService,
  ) {}

  /** All possible slots for a doctor on a date, minus booked ones. */
  async availableSlots(doctorId: string, date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('date must be YYYY-MM-DD');
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    const windows = await this.schedules
      .find({ doctorId })
      .sort({ start: 1 })
      .lean()
      .exec();
    const todays = windows.filter((w) => w.dayOfWeek === dayOfWeek);
    const all: Array<{ start: string; end: string }> = [];
    for (const w of todays) {
      const step = w.slotMinutes ?? 30;
      for (let t = toMinutes(w.start); t + step <= toMinutes(w.end); t += step) {
        all.push({ start: toHHmm(t), end: toHHmm(t + step) });
      }
    }
    const booked = await this.appts
      .find({
        doctorId,
        date,
        status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      })
      .select('start')
      .lean()
      .exec();
    const taken = new Set(booked.map((b) => b.start));
    return all.map((s) => ({ ...s, available: !taken.has(s.start) }));
  }

  /** Book a slot. Duplicate (doctor,date,start) → 409 even under race (DB unique index). */
  async book(patientId: string, doctorId: string, date: string, start: string, reason = '') {
    const slots = await this.availableSlots(doctorId, date);
    const slot = slots.find((s) => s.start === start);
    if (!slot) throw new BadRequestException('slot not in doctor schedule');
    if (!slot.available) throw new ConflictException('slot already booked');
    // No past bookings (compare date+start to now, UTC day precision is enough for v1)
    if (new Date(`${date}T${start}:00Z`).getTime() < Date.now() - 60_000) {
      throw new BadRequestException('cannot book past slots');
    }
    try {
      const created = await this.appts.create({
        patientId,
        doctorId,
        date,
        start,
        end: slot.end,
        status: AppointmentStatus.PENDING,
        reason,
      });
      // Async: notify + email (does not block booking on failure)
      await this.events.emitAppointmentBooked({
        appointmentId: String(created._id),
        doctorId,
        patientId,
        date,
        start,
      });
      return created;
    } catch (e: any) {
      if (e?.code === 11000) throw new ConflictException('slot already booked');
      throw e;
    }
  }

  async approve(id: string) {
    const appt = await this.appts.findById(id);
    if (!appt) throw new NotFoundException('appointment not found');
    if (appt.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException(`cannot approve ${appt.status}`);
    }
    appt.status = AppointmentStatus.CONFIRMED;
    await appt.save();
    await this.events.emitAppointmentApproved({
      appointmentId: id,
      patientId: String(appt.patientId),
      doctorId: String(appt.doctorId),
    });
    return appt;
  }

  async reject(id: string) {
    const appt = await this.appts.findById(id);
    if (!appt) throw new NotFoundException('appointment not found');
    if (appt.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException(`cannot reject ${appt.status}`);
    }
    appt.status = AppointmentStatus.REJECTED;
    await appt.save();
    await this.events.emitAppointmentCancelled({
      appointmentId: id,
      patientId: String(appt.patientId),
      doctorId: String(appt.doctorId),
      reason: 'rejected',
    });
    return appt;
  }

  /** Doctor marks a confirmed visit as completed (enables reviews/history). */
  async complete(id: string) {
    const appt = await this.appts.findById(id);
    if (!appt) throw new NotFoundException('appointment not found');
    if (appt.status !== AppointmentStatus.CONFIRMED) {
      throw new BadRequestException(`cannot complete ${appt.status} (confirm it first)`);
    }
    appt.status = AppointmentStatus.COMPLETED;
    await appt.save();
    return appt;
  }

  async cancel(id: string, requesterId: string, requesterRoles: string[]) {
    const appt = await this.appts.findById(id);
    if (!appt) throw new NotFoundException('appointment not found');
    const isOwner = String(appt.patientId) === requesterId;
    const isStaff = requesterRoles.some((r) => ['ADMIN', 'SUPER_ADMIN', 'STAFF', 'DOCTOR'].includes(r));
    if (!isOwner && !isStaff) throw new ForbiddenException('not your appointment');
    if ([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED].includes(appt.status)) {
      throw new BadRequestException(`already ${appt.status}`);
    }
    appt.status = AppointmentStatus.CANCELLED;
    await appt.save();
    await this.events.emitAppointmentCancelled({
      appointmentId: id,
      patientId: String(appt.patientId),
      doctorId: String(appt.doctorId),
    });
    return appt;
  }

  async reschedule(id: string, requesterId: string, date: string, start: string) {
    const appt = await this.appts.findById(id);
    if (!appt) throw new NotFoundException('appointment not found');
    if (String(appt.patientId) !== requesterId) throw new ForbiddenException('not your appointment');
    if (![AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED].includes(appt.status)) {
      throw new BadRequestException(`cannot reschedule ${appt.status}`);
    }
    const slots = await this.availableSlots(String(appt.doctorId), date);
    const slot = slots.find((s) => s.start === start);
    if (!slot || !slot.available) throw new ConflictException('new slot not available');
    // Free old slot (cancel) then create new — keeps unique index simple.
    appt.status = AppointmentStatus.CANCELLED;
    await appt.save();
    return this.book(requesterId, String(appt.doctorId), date, start, appt.reason);
  }

  historyForPatient(patientId: string, page = 1, limit = 20, status?: string) {
    return this.paginate({ patientId }, page, limit, status);
  }

  historyForDoctor(doctorId: string, page = 1, limit = 20, status?: string) {
    return this.paginate({ doctorId }, page, limit, status);
  }

  async getById(id: string) {
    const appt = await this.appts.findById(id).lean().exec();
    if (!appt) throw new NotFoundException('appointment not found');
    return appt;
  }

  private async paginate(where: any, page: number, limit: number, status?: string) {
    const q: any = { ...where };
    if (status && (Object.values(AppointmentStatus) as string[]).includes(status)) {
      q.status = status;
    }
    const [items, total] = await Promise.all([
      this.appts
        .find(q)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ date: -1, start: -1 })
        .lean()
        .exec(),
      this.appts.countDocuments(q),
    ]);
    return { items, total, page, limit };
  }
}
