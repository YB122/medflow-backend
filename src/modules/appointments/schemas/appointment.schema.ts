import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export type AppointmentDocument = HydratedDocument<Appointment>;

export enum AppointmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

@Schema({ timestamps: true })
export class Appointment {
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  patientId!: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  doctorId!: mongoose.Types.ObjectId;

  /** "YYYY-MM-DD" */
  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  date!: string;

  /** "HH:mm" */
  @Prop({ required: true, match: /^\d{2}:\d{2}$/ })
  start!: string;

  @Prop({ required: true, match: /^\d{2}:\d{2}$/ })
  end!: string;

  @Prop({ enum: AppointmentStatus, default: AppointmentStatus.PENDING })
  status!: AppointmentStatus;

  @Prop({ default: '', maxlength: 500 })
  reason!: string;

  @Prop({ default: '' })
  doctorNote!: string;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);
// Anti-double-booking: one active slot per doctor+date+start.
// Cancelled/Rejected/Completed slots are excluded so they can be rebooked.
AppointmentSchema.index(
  { doctorId: 1, date: 1, start: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['PENDING', 'CONFIRMED'] } },
  },
);
AppointmentSchema.index({ patientId: 1, date: 1 });
AppointmentSchema.index({ doctorId: 1, date: 1, status: 1 });
