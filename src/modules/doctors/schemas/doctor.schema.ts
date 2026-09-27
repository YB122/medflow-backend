import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { User } from '../../users/schemas/user.schema.js';
import { Specialty } from './specialty.schema.js';
import { Clinic } from './clinic.schema.js';

export type DoctorDocument = HydratedDocument<Doctor>;

@Schema({ timestamps: true })
export class Doctor {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name, required: true, unique: true })
  userId!: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Specialty.name })
  specialtyId?: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Clinic.name })
  clinicId?: mongoose.Types.ObjectId;

  @Prop({ default: '' })
  bio!: string;

  /** Consultation price (for filter by price). */
  @Prop({ default: 0, min: 0 })
  price!: number;

  @Prop({ default: '' })
  city!: string;

  @Prop({ default: false })
  verified!: boolean;

  /** Cloudinary URL of the doctor's profile photo (uploaded by the doctor). */
  @Prop({ default: '' })
  photoUrl!: string;

  /** Clinic location for the map picker (Cairo default on the frontend). */
  @Prop()
  lng?: number;

  @Prop()
  lat?: number;

  /** Years of professional experience (shown on the doctor's public page). */
  @Prop({ min: 0, max: 80 })
  yearsOfExperience?: number;

  /** Staff (receptionists) hired by this doctor — scoped appointment access. */
  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: User.name }], default: [] })
  staffIds!: mongoose.Types.ObjectId[];

  @Prop({ default: 0, min: 0, max: 5 })
  ratingAvg!: number;

  @Prop({ default: 0, min: 0 })
  ratingCount!: number;
}

export const DoctorSchema = SchemaFactory.createForClass(Doctor);
DoctorSchema.index({ specialtyId: 1, city: 1, price: 1 });
