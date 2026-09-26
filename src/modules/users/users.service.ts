import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, UserStatus } from './schemas/user.schema.js';
import { Role, RoleDocument } from './schemas/role.schema.js';
import { DEFAULT_ROLES } from './roles.seed.js';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private users: Model<UserDocument>,
    @InjectModel(Role.name) private roles: Model<RoleDocument>,
  ) {}

  /** Seed roles + default super admin on boot (idempotent). */
  async onModuleInit() {
    for (const [name, permissions] of Object.entries(DEFAULT_ROLES)) {
      await this.roles.updateOne(
        { name },
        { $setOnInsert: { name }, $set: { permissions } },
        { upsert: true },
      );
    }
    const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? '').toLowerCase();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '';
    if (adminEmail && adminPassword) {
      const superAdmin = await this.roles.findOne({ name: 'SUPER_ADMIN' });
      const exists = await this.users.findOne({ email: adminEmail });
      if (!exists && superAdmin) {
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await this.users.create({
          email: adminEmail,
          passwordHash,
          roles: [superAdmin._id] as any,
          status: UserStatus.ACTIVE,
        });
        this.logger.log(`seeded super admin ${adminEmail}`);
      }
    }
  }

  findByEmailWithSecret(email: string) {
    return this.users
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .populate('roles')
      .exec();
  }

  findByPhoneWithSecret(phone: string) {
    return this.users
      .findOne({ phone })
      .select('+passwordHash')
      .populate('roles')
      .exec();
  }

  /** Route an `email or phone` identifier to the right lookup. */
  findByIdentifierWithSecret(identifier: string) {
    const id = identifier.trim();
    if (id.includes('@')) return this.findByEmailWithSecret(id);
    return this.findByPhoneWithSecret(id);
  }

  findById(id: string) {
    return this.users.findById(id).populate('roles').exec();
  }

  async create(
    input: { email?: string; phone?: string; passwordHash: string },
    roleNames: string[] = ['PATIENT'],
  ) {
    const roles = await this.roles.find({ name: { $in: roleNames } });
    return this.users.create({
      email: input.email?.toLowerCase(),
      phone: input.phone,
      passwordHash: input.passwordHash,
      roles: roles.map((r) => r._id) as any,
      status: UserStatus.ACTIVE,
    });
  }

  async list(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.users.find().populate('roles').skip(skip).limit(limit).sort({ createdAt: -1 }).exec(),
      this.users.countDocuments(),
    ]);
    return { items, total, page, limit };
  }

  /** Admin suspend/activate. */
  async setStatus(id: string, status: UserStatus) {
    const user = await this.users.findByIdAndUpdate(id, { status }, { new: true }).populate('roles');
    if (!user) throw new Error('user not found');
    return user;
  }

  /** Admin role assignment (RBAC: requires role:assign). */
  async setRoles(id: string, roleNames: string[]) {
    const roles = await this.roles.find({ name: { $in: roleNames } });
    const found = new Set(roles.map((r) => r.name));
    const unknown = roleNames.filter((n) => !found.has(n));
    if (unknown.length > 0) throw new Error(`unknown roles: ${unknown.join(', ')}`);
    const user = await this.users
      .findByIdAndUpdate(id, { roles: roles.map((r) => r._id) }, { new: true })
      .populate('roles');
    if (!user) throw new Error('user not found');
    return user;
  }

  /** Flatten permissions from populated roles + extraPermissions. */
  collectPermissions(user: { roles?: any[]; extraPermissions?: string[] }): string[] {
    const fromRoles: string[] = (user.roles ?? []).flatMap((r: any) =>
      typeof r === 'string' ? [] : (r.permissions ?? []),
    );
    const all = new Set([...fromRoles, ...(user.extraPermissions ?? [])]);
    return [...all];
  }

  roleNames(user: { roles?: any[] }): string[] {
    return (user.roles ?? []).map((r: any) => (typeof r === 'string' ? r : r.name));
  }
}
