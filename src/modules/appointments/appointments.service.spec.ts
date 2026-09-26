import { jest } from '@jest/globals';
import { AppointmentsService, toMinutes, toHHmm } from './appointments.service.js';

describe('slot helpers', () => {
  it('converts HH:mm <-> minutes', () => {
    expect(toMinutes('09:00')).toBe(540);
    expect(toMinutes('13:30')).toBe(810);
    expect(toHHmm(540)).toBe('09:00');
    expect(toHHmm(810)).toBe('13:30');
  });
});

describe('AppointmentsService double-booking', () => {
  const schedules = [
    { doctorId: 'd1', dayOfWeek: 1, start: '09:00', end: '10:00', slotMinutes: 30 },
  ];

  const makeService = (bookedStarts: string[], createImpl?: any) => {
    const appts = {
      find: jest.fn<any>().mockReturnValue({ select: () => ({ lean: () => ({ exec: () => Promise.resolve(bookedStarts.map((start) => ({ start }))) }) }) }),
      create: jest.fn<any>().mockImplementation(createImpl ?? ((doc: any) => Promise.resolve({ _id: 'a1', ...doc }))),
    } as any;
    const sched = {
      find: jest.fn<any>().mockReturnValue({ sort: () => ({ lean: () => ({ exec: () => Promise.resolve(schedules) }) }) }),
    } as any;
    const events = {
      emitAppointmentBooked: jest.fn<any>(),
      emitAppointmentApproved: jest.fn<any>(),
      emitAppointmentCancelled: jest.fn<any>(),
    } as any;
    return new AppointmentsService(appts, sched, events);
  };

  it('marks taken slots unavailable', async () => {
    const svc = makeService(['09:00']);
    // 2026-09-28 is a Monday (dayOfWeek 1)
    const slots = await svc.availableSlots('d1', '2026-09-28');
    expect(slots).toEqual([
      { start: '09:00', end: '09:30', available: false },
      { start: '09:30', end: '10:00', available: true },
    ]);
  });

  it('rejects booking an already-taken slot (Patient A vs Patient B)', async () => {
    const svc = makeService(['09:00']);
    await expect(svc.book('pB', 'd1', '2026-09-28', '09:00')).rejects.toThrow('slot already booked');
  });

  it('maps duplicate-key race to 409 Conflict', async () => {
    const err: any = new Error('dup');
    err.code = 11000;
    const svc = makeService([], () => Promise.reject(err));
    await expect(svc.book('pB', 'd1', '2026-09-28', '09:30')).rejects.toThrow('slot already booked');
  });

  it('rejects slots outside the doctor schedule', async () => {
    const svc = makeService([]);
    await expect(svc.book('pA', 'd1', '2026-09-28', '15:00')).rejects.toThrow('not in doctor schedule');
  });
});
