import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema.js';
import { Doctor } from '../doctors/schemas/doctor.schema.js';
import { Appointment, AppointmentStatus } from '../appointments/schemas/appointment.schema.js';
import { Payment, PaymentStatus } from '../payments/schemas/payment.schema.js';
import { Review } from '../doctors/schemas/review.schema.js';
import { Schedule } from '../schedules/schemas/schedule.schema.js';
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
    @InjectModel(Review.name) private reviews: Model<Review>,
    @InjectModel(Schedule.name) private schedules: Model<Schedule>,
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

  /**
   * Doctor list for verification, including account contact (email/phone).
   * Admin-only: the public /doctors search never exposes contact info.
   */
  @Get('doctors')
  async listDoctors(@Query('page') page = '1', @Query('limit') limit = '20') {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const [items, total] = await Promise.all([
      this.doctors
        .find()
        .populate('specialtyId clinicId')
        .populate({ path: 'userId', select: 'email phone photoUrl' })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.doctors.countDocuments(),
    ]);
    return { items, total, page: safePage, limit: safeLimit };
  }

  /**
   * Full doctor dossier for verification review: profile + account contact,
   * schedule, appointment stats and recent reviews. Admin-only.
   */
  @Get('doctors/:id')
  async doctorDetail(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('doctor not found');
    const [doctor, schedules, reviews, apptStats] = await Promise.all([
      this.doctors
        .findById(id)
        .populate('specialtyId clinicId')
        .populate({ path: 'userId', select: 'email phone photoUrl status roles createdAt' })
        .lean()
        .exec(),
      this.schedules.find({ doctorId: id }).sort({ dayOfWeek: 1, start: 1 }).lean().exec(),
      this.reviews.find({ doctorId: id }).sort({ createdAt: -1 }).limit(20).lean().exec(),
      this.appts
        .aggregate([
          { $match: { doctorId: new Types.ObjectId(id) } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    if (!doctor) throw new NotFoundException('doctor not found');
    const byStatus: Record<string, number> = {};
    for (const r of apptStats) byStatus[r._id] = r.count;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { doctor, schedules, reviews, stats: { total, byStatus } };
  }
}
