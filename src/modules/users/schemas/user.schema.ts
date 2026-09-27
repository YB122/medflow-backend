import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument } from 'mongoose';
import { Role } from './role.schema.js';

export type UserDocument = HydratedDocument<User>;

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Schema({ timestamps: true })
export class User {
  /** Either email or phone (or both) identifies the account. Sparse so phone-only users work. */
  @Prop({ required: false, unique: true, sparse: true, lowercase: true, trim: true })
  email?: string;

  /** E.164-ish digits, optional `+` prefix. Sparse unique for phone-only users. */
  @Prop({ required: false, unique: true, sparse: true, trim: true })
  phone?: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: Role.name }], default: [] })
  roles!: Role[];

  /** Direct grants on top of roles (rare; prefer roles). */
  @Prop({ type: [String], default: [] })
  extraPermissions!: string[];

  @Prop({ enum: UserStatus, default: UserStatus.ACTIVE })
  status!: UserStatus;

  /** Cloudinary URL of the user's profile photo (all roles). */
  @Prop({ default: '' })
  photoUrl!: string;

  /** Personal bio about yourself (all roles; doctors also have a professional bio). */
  @Prop({ default: '', maxlength: 500 })
  bio!: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
