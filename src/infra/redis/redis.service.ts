import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  private async ensureConnected(): Promise<boolean> {
    try {
      const status = this.redis.status as string;
      if (status === 'ready') return true;
      if (status === 'end' || status === 'close') return false;
      await this.redis.ping().catch(() => this.redis.connect().catch(() => null));
      return (this.redis.status as string) === 'ready';
    } catch (e) {
      this.logger.warn(`redis unavailable: ${(e as Error).message}`);
      return false;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!(await this.ensureConnected())) return;
    if (ttlSeconds) await this.redis.set(key, value, 'EX', ttlSeconds);
    else await this.redis.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    if (!(await this.ensureConnected())) return null;
    return this.redis.get(key);
  }

  async del(key: string): Promise<void> {
    if (!(await this.ensureConnected())) return;
    await this.redis.del(key);
  }

  /** OTP helpers: otp:user:<id> with 5-minute TTL */
  otpKey(userId: string): string {
    return `otp:user:${userId}`;
  }

  async saveOtp(userId: string, code: string, ttlSeconds = 300): Promise<void> {
    await this.set(this.otpKey(userId), code, ttlSeconds);
  }

  async verifyOtp(userId: string, code: string): Promise<boolean> {
    const saved = await this.get(this.otpKey(userId));
    if (!saved) return false;
    if (saved !== code) return false;
    await this.del(this.otpKey(userId));
    return true;
  }

  /** Refresh-token allowlist: refresh:<userId>:<jti> */
  refreshKey(userId: string, jti: string): string {
    return `refresh:${userId}:${jti}`;
  }
}
