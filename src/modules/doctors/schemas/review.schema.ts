import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { Doctor } from './doctor.schema.js';
import { User } from '../../users/schemas/user.schema.js';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Doctor.name, required: true })
  doctorId!: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name, required: true })
  patientId!: mongoose.Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  stars!: number;

  @Prop({ default: '', maxlength: 1000 })
  comment!: string;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ doctorId: 1, patientId: 1 }, { unique: true });
