import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export enum NotificationType {
  BOOKED = 'BOOKED',
  APPROVED = 'APPROVED',
  CANCELLED = 'CANCELLED',
  REMINDER = 'REMINDER',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: mongoose.Schema.Types.ObjectId, required: true })
  userId!: mongoose.Types.ObjectId;

  @Prop({ enum: NotificationType, required: true })
  type!: NotificationType;

  @Prop({ default: '' })
  title!: string;

  @Prop({ default: '' })
  body!: string;

  @Prop({ default: false })
  read!: boolean;

  @Prop({ type: mongoose.Schema.Types.ObjectId })
  appointmentId?: mongoose.Types.ObjectId;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, createdAt: -1 });
