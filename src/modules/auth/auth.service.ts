import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID, randomInt } from 'crypto';
import { UsersService } from '../users/users.service.js';
import { UserStatus } from '../users/schemas/user.schema.js';
import { RedisService } from '../../infra/redis/redis.service.js';

function parseTtlToSeconds(ttl: string, fallback: number): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return fallback;
  const n = Number(m[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]] ?? 1;
  return n * mult;
}

/** Strip spaces/dashes; keep optional leading `+`. */
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (!/^\+?[0-9]{8,15}$/.test(cleaned)) {
    throw new BadRequestException('phone must be 8-15 digits, optional + prefix');
  }
  return cleaned;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  private accessSecret(): string {
    return process.env.JWT_ACCESS_SECRET ?? 'change-me-access-secret-min-32-chars';
  }

  private refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh-secret-min-32-chars';
  }

  private async tokens(
    userId: string,
    contact: { email?: string; phone?: string },
    roles: string[],
    permissions: string[],
  ) {
    const accessTtl = process.env.JWT_ACCESS_TTL ?? '15m';
    const refreshTtl = process.env.JWT_REFRESH_TTL ?? '7d';
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: userId, email: contact.email ?? null, phone: contact.phone ?? null, roles, permissions },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { secret: this.accessSecret(), expiresIn: accessTtl as any },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { secret: this.refreshSecret(), expiresIn: refreshTtl as any },
    );
    // Allowlist the refresh jti so logout/rotation can revoke it.
    await this.redis.set(
      this.redis.refreshKey(userId, jti),
      '1',
      parseTtlToSeconds(refreshTtl, 7 * 24 * 3600),
    );
    return { accessToken, refreshToken };
  }

  /** Register with email and/or phone (at least one required). */
  async register(email: string | undefined, phone: string | undefined, password: string) {
    const cleanEmail = email?.trim().toLowerCase() || undefined;
    const cleanPhone = phone ? normalizePhone(phone) : undefined;
    if (!cleanEmail && !cleanPhone) {
      throw new BadRequestException('email or phone is required');
    }
    if (cleanEmail) {
      const existing = await this.users.findByEmailWithSecret(cleanEmail);
      if (existing) throw new ConflictException('email already registered');
    }
    if (cleanPhone) {
      const existing = await this.users.findByPhoneWithSecret(cleanPhone);
      if (existing) throw new ConflictException('phone already registered');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.users.create(
      { email: cleanEmail, phone: cleanPhone, passwordHash },
      ['PATIENT'],
    );
    const populated = await this.users.findById(String(user._id));
    const roles = this.users.roleNames(populated as any);
    const permissions = this.users.collectPermissions(populated as any);
    return this.tokens(
      String(user._id),
      { email: user.email, phone: user.phone },
      roles,
      permissions,
    );
  }

  /** Login with an email or phone identifier. */
  async login(identifier: string, password: string) {
    const id = identifier.trim();
    const lookupId = id.includes('@') ? id.toLowerCase() : normalizePhone(id);
    const user = await this.users.findByIdentifierWithSecret(lookupId);
    if (!user) throw new UnauthorizedException('invalid credentials');
    if (user.status !== UserStatus.ACTIVE) throw new ForbiddenException('account suspended');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('invalid credentials');
    const roles = this.users.roleNames(user as any);
    const permissions = this.users.collectPermissions(user as any);
    return this.tokens(
      String(user._id),
      { email: user.email, phone: user.phone },
      roles,
      permissions,
    );
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: this.refreshSecret() });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
    const { sub: userId, jti } = payload ?? {};
    if (!userId || !jti) throw new UnauthorizedException('invalid refresh token');

    // Must still be allowlisted (not logged out / rotated).
    const allowed = await this.redis.get(this.redis.refreshKey(userId, jti));
    if (!allowed) throw new UnauthorizedException('refresh token revoked');

    // Rotate: revoke old jti, issue new pair.
    await this.redis.del(this.redis.refreshKey(userId, jti));

    const user = await this.users.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('user no longer active');
    }
    const roles = this.users.roleNames(user as any);
    const permissions = this.users.collectPermissions(user as any);
    return this.tokens(String(user._id), { email: user.email, phone: user.phone }, roles, permissions);
  }

  async logout(userId: string, refreshToken?: string) {
    if (!refreshToken) return { ok: true };
    try {
      const payload: any = await this.jwt.verifyAsync(refreshToken, {
        secret: this.refreshSecret(),
        ignoreExpiration: true,
      });
      if (payload?.jti) await this.redis.del(this.redis.refreshKey(userId, payload.jti));
    } catch {
      // idempotent logout
    }
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('user not found');
    return {
      id: String(user._id),
      email: user.email ?? null,
      phone: (user as any).phone ?? null,
      status: user.status,
      roles: this.users.roleNames(user as any),
      permissions: this.users.collectPermissions(user as any),
    };
  }

  /** OTP skeleton: issue 6-digit code with 5-min TTL (SMS/email in later service). */
  async issueOtp(userId: string) {
    const code = String(randomInt(100_000, 999_999));
    await this.redis.saveOtp(userId, code, 300);
    // In dev, return code so you can test without SMS. In prod, send via queue instead.
    return process.env.NODE_ENV === 'production' ? { sent: true } : { sent: true, devCode: code };
  }

  async verifyOtp(userId: string, code: string) {
    const ok = await this.redis.verifyOtp(userId, code);
    if (!ok) throw new UnauthorizedException('invalid or expired OTP');
    return { verified: true };
  }
}
