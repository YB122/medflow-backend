import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ClinicDocument = HydratedDocument<Clinic>;

@Schema({ timestamps: true })
export class Clinic {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: '' })
  city!: string;

  @Prop({ default: '' })
  address!: string;

  @Prop({ default: '' })
  phone!: string;
}

export const ClinicSchema = SchemaFactory.createForClass(Clinic);
