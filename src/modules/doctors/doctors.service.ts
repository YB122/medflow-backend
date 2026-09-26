import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Doctor, DoctorDocument } from './schemas/doctor.schema.js';
import { Specialty, SpecialtyDocument } from './schemas/specialty.schema.js';
import { Clinic, ClinicDocument } from './schemas/clinic.schema.js';
import { Review, ReviewDocument } from './schemas/review.schema.js';
import { Schedule, ScheduleDocument } from '../schedules/schemas/schedule.schema.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { CloudinaryService } from '../../infra/cloudinary/cloudinary.service.js';

@Injectable()
export class DoctorsService {
  constructor(
    @InjectModel(Doctor.name) private doctors: Model<DoctorDocument>,
    @InjectModel(Specialty.name) private specialties: Model<SpecialtyDocument>,
    @InjectModel(Clinic.name) private clinics: Model<ClinicDocument>,
    @InjectModel(Review.name) private reviews: Model<ReviewDocument>,
    @InjectModel(Schedule.name) private schedules: Model<ScheduleDocument>,
    private readonly redis: RedisService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // ---------- Search with filters + Redis cache for plain list ----------
  async search(filters: {
    specialtyId?: string;
    city?: string;
    maxPrice?: number;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const { specialtyId, city, maxPrice, q, page = 1, limit = 20 } = filters;
    const isPlainList = !specialtyId && !city && !maxPrice && !q && page === 1;
    if (isPlainList) {
      const cached = await this.redis.get('doctors:list');
      if (cached) return JSON.parse(cached);
    }
    const where: any = {};
    if (specialtyId) where.specialtyId = specialtyId;
    if (city) where.city = new RegExp(`^${city}$`, 'i');
    if (maxPrice !== undefined) where.price = { $lte: maxPrice };
    if (q) where.bio = new RegExp(q, 'i');
    const [items, total] = await Promise.all([
      this.doctors
        .find(where)
        .populate('specialtyId clinicId')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ ratingAvg: -1 })
        .lean()
        .exec(),
      this.doctors.countDocuments(where),
    ]);
    const result = { items, total, page, limit };
    if (isPlainList) await this.redis.set('doctors:list', JSON.stringify(result), 60);
    return result;
  }

  async getProfile(id: string): Promise<any> {    const doctor = await this.doctors
      .findById(id)
      .populate('specialtyId clinicId userId')
      .lean()
      .exec();
    if (!doctor) throw new NotFoundException('doctor not found');
    const schedules = await this.schedules.find({ doctorId: id }).lean().exec();
    const reviews = await this.reviews
      .find({ doctorId: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec();
    return { ...doctor, schedules, reviews };
  }

  /** Owner (user id) of a doctor profile — used for photo-upload ownership checks. */
  async ownerOf(id: string): Promise<string | null> {
    const doctor = await this.doctors.findById(id).select('userId').lean().exec();
    if (!doctor) return null;
    return String(doctor.userId);
  }

  async create(data: Partial<Doctor>) {
    const exists = await this.doctors.findOne({ userId: data.userId });
    if (exists) throw new ConflictException('doctor profile already exists');
    const doctor = await this.doctors.create(data);
    await this.redis.del('doctors:list');
    return doctor;
  }

  async update(id: string, data: Partial<Doctor>) {
    const doctor = await this.doctors.findByIdAndUpdate(id, data, { new: true });
    if (!doctor) throw new NotFoundException('doctor not found');
    await this.redis.del('doctors:list');
    return doctor;
  }

  async remove(id: string) {
    await this.doctors.findByIdAndDelete(id);
    await this.redis.del('doctors:list');
    return { ok: true };
  }

  /** Admin verifies doctor account. */
  async verify(id: string, verified: boolean) {
    const doctor = await this.doctors.findByIdAndUpdate(id, { verified }, { new: true });
    if (!doctor) throw new NotFoundException('doctor not found');
    await this.redis.del('doctors:list');
    return doctor;
  }

  /**
   * Upload a profile photo to Cloudinary and save its URL.
   * Ownership (own profile vs admin) is enforced in the controller.
   */
  async setPhoto(id: string, file: { buffer: Buffer; mimetype: string }) {
    const doctor = await this.doctors.findById(id);
    if (!doctor) throw new NotFoundException('doctor not found');
    const photoUrl = await this.cloudinary.uploadImage(file.buffer, file.mimetype);
    doctor.photoUrl = photoUrl;
    await doctor.save();
    await this.redis.del('doctors:list');
    return doctor;
  }

  // ---------- Schedules ----------
  async setSchedules(doctorId: string, windows: Array<{ dayOfWeek: number; start: string; end: string; slotMinutes?: number }>) {
    for (const w of windows) {
      if (w.dayOfWeek < 0 || w.dayOfWeek > 6) throw new BadRequestException('dayOfWeek 0..6');
      if (w.start >= w.end) throw new BadRequestException('start must be before end');
    }
    await this.schedules.deleteMany({ doctorId });
    if (windows.length === 0) return [];
    return this.schedules.insertMany(
      windows.map((w) => ({ doctorId, ...w, slotMinutes: w.slotMinutes ?? 30 })),
    );
  }

  getSchedules(doctorId: string) {
    return this.schedules.find({ doctorId }).sort({ dayOfWeek: 1, start: 1 }).lean().exec();
  }

  // ---------- Specialties & clinics ----------
  createSpecialty(name: string, description = '') {
    return this.specialties.create({ name, description });
  }
  listSpecialties() {
    return this.specialties.find().sort({ name: 1 }).lean().exec();
  }
  createClinic(data: Partial<Clinic>) {
    return this.clinics.create(data);
  }
  listClinics() {
    return this.clinics.find().sort({ name: 1 }).lean().exec();
  }

  // ---------- Reviews: one per patient per doctor, updates avg ----------
  async rate(doctorId: string, patientId: string, stars: number, comment = '') {
    if (stars < 1 || stars > 5) throw new BadRequestException('stars 1..5');
    const doctor = await this.doctors.findById(doctorId);
    if (!doctor) throw new NotFoundException('doctor not found');
    await this.reviews.findOneAndUpdate(
      { doctorId, patientId },
      { $set: { stars, comment } },
      { upsert: true, new: true },
    );
    const agg = await this.reviews
      .aggregate([
        { $match: { doctorId: doctor._id } },
        { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 } } },
      ])
      .exec();
    doctor.ratingAvg = agg[0]?.avg ?? stars;
    doctor.ratingCount = agg[0]?.count ?? 1;
    await doctor.save();
    await this.redis.del('doctors:list');
    return { ratingAvg: doctor.ratingAvg, ratingCount: doctor.ratingCount };
  }
}
