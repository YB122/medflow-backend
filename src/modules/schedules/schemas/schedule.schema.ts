import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { Doctor } from '../../doctors/schemas/doctor.schema.js';

export type ScheduleDocument = HydratedDocument<Schedule>;

/** One working window, e.g. Monday 09:00-13:00. dayOfWeek: 0=Sunday..6=Saturday */
@Schema({ timestamps: true })
export class Schedule {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Doctor.name, required: true })
  doctorId!: mongoose.Types.ObjectId;

  @Prop({ required: true, min: 0, max: 6 })
  dayOfWeek!: number;

  /** "HH:mm" 24h */
  @Prop({ required: true, match: /^\d{2}:\d{2}$/ })
  start!: string;

  @Prop({ required: true, match: /^\d{2}:\d{2}$/ })
  end!: string;

  /** Slot length in minutes */
  @Prop({ default: 30, min: 5, max: 120 })
  slotMinutes!: number;
}

export const ScheduleSchema = SchemaFactory.createForClass(Schedule);
ScheduleSchema.index({ doctorId: 1, dayOfWeek: 1 });
