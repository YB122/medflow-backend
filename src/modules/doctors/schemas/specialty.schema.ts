import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SpecialtyDocument = HydratedDocument<Specialty>;

@Schema({ timestamps: true })
export class Specialty {
  /** Canonical name (English recommended, e.g. "Cardiology"). */
  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  /** Arabic display name (e.g. "قلبية"). Falls back to `name` when empty. */
  @Prop({ default: '', trim: true })
  nameAr!: string;

  @Prop({ default: '' })
  description!: string;
}

export const SpecialtySchema = SchemaFactory.createForClass(Specialty);
