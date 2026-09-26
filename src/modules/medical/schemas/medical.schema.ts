import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export type MedicalRecordDocument = HydratedDocument<MedicalRecord>;

@Schema({ timestamps: true })
export class MedicalRecord {
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  patientId!: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  doctorId!: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  appointmentId?: mongoose.Types.ObjectId;

  @Prop({ default: '', maxlength: 5000 })
  notes!: string;

  @Prop({ default: '', maxlength: 2000 })
  diagnosis!: string;
}

export const MedicalRecordSchema = SchemaFactory.createForClass(MedicalRecord);
MedicalRecordSchema.index({ patientId: 1, createdAt: -1 });

export type PrescriptionDocument = HydratedDocument<Prescription>;

@Schema({ timestamps: true })
export class Prescription {
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  recordId!: mongoose.Types.ObjectId;

  @Prop({ default: '', maxlength: 1000 })
  medication!: string;

  @Prop({ default: '', maxlength: 500 })
  dosage!: string;

  @Prop({ default: '', maxlength: 1000 })
  instructions!: string;
}

export const PrescriptionSchema = SchemaFactory.createForClass(Prescription);
