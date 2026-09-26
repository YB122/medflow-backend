import { Controller, Get } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema.js';
import { Doctor } from '../doctors/schemas/doctor.schema.js';
import { Appointment, AppointmentStatus } from '../appointments/schemas/appointment.schema.js';
import { Payment, PaymentStatus } from '../payments/schemas/payment.schema.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';

@Controller('admin')
@Roles('ADMIN', 'SUPER_ADMIN')
@RequirePermissions('report:read')
export class AdminController {
  constructor(
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Doctor.name) private doctors: Model<Doctor>,
    @InjectModel(Appointment.name) private appts: Model<Appointment>,
    @InjectModel(Payment.name) private payments: Model<Payment>,
  ) {}

  /** Cards: doctors / patients / bookings / revenue + today's breakdown. */
  @Get('dashboard')
  async dashboard() {
    const today = new Date().toISOString().slice(0, 10);
    const [doctorCount, patientCount, bookingCount, revenueAgg, todayAgg] = await Promise.all([
      this.doctors.countDocuments(),
      this.users.countDocuments(),
      this.appts.countDocuments(),
      this.payments
        .aggregate([{ $match: { status: PaymentStatus.PAID } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
        .exec(),
      this.appts.aggregate([{ $match: { date: today } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).exec(),
    ]);
    const byStatus: Record<string, number> = {};
    for (const r of todayAgg) byStatus[r._id] = r.count;
    return {
      cards: {
        doctors: doctorCount,
        patients: patientCount,
        bookings: bookingCount,
        revenue: revenueAgg[0]?.total ?? 0,
      },
      today: {
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        completed: byStatus[AppointmentStatus.COMPLETED] ?? 0,
        cancelled: byStatus[AppointmentStatus.CANCELLED] ?? 0,
        pending: byStatus[AppointmentStatus.PENDING] ?? 0,
        confirmed: byStatus[AppointmentStatus.CONFIRMED] ?? 0,
      },
    };
  }

  /** Monthly series for charts: appointments + revenue by month (YYYY-MM). */
  @Get('reports/monthly')
  async monthly() {
    const appointments = await this.appts
      .aggregate([
        { $group: { _id: { $substr: ['$date', 0, 7] }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .exec();
    const revenue = await this.payments
      .aggregate([
        { $match: { status: PaymentStatus.PAID } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: '$amount' } } },
        { $sort: { _id: 1 } },
      ])
      .exec();
    return { appointments, revenue };
  }

  /** Top doctors by completed appointments. */
  @Get('reports/top-doctors')
  async topDoctors() {
    return this.appts
      .aggregate([
        { $match: { status: { $in: [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED] } } },
        { $group: { _id: '$doctorId', bookings: { $sum: 1 } } },
        { $sort: { bookings: -1 } },
        { $limit: 10 },
      ])
      .exec();
  }
}
