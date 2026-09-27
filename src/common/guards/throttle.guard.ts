import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const THROTTLE_KEY = 'medflow:throttle';

export interface ThrottleOptions {
  limit: number;
  ttl: number;
}

/**
 * Route-level override, same shape as the old @nestjs/throttler decorator
 * so call sites don't change: `@Throttle({ default: { limit: 5, ttl: 60_000 } })`.
 */
export const Throttle = (opts: { default: ThrottleOptions }) =>
  SetMetadata(THROTTLE_KEY, opts.default);

const DEFAULT_LIMIT = 100;
const DEFAULT_TTL_MS = 60_000;

/**
 * Minimal in-memory rate-limit guard (per IP + route, sliding window).
 * Replaces @nestjs/throttler, whose CJS dist cannot require() the ESM
 * @nestjs/* packages on serverless runtimes. Counts live in-process:
 * correct per instance; use Redis backing if you ever need distributed limits.
 */
@Injectable()
export class ThrottlerGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // Only HTTP traffic is throttled (ws/chat auth is handled elsewhere).
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest();

    const override = this.reflector.getAllAndOverride<ThrottleOptions>(THROTTLE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const limit = override?.limit ?? DEFAULT_LIMIT;
    const ttl = override?.ttl ?? DEFAULT_TTL_MS;

    const now = Date.now();
    if (now - this.lastSweep > 60_000) {
      for (const [k, stamps] of this.hits) {
        const fresh = stamps.filter((t) => now - t < DEFAULT_TTL_MS * 2);
        if (fresh.length > 0) this.hits.set(k, fresh);
        else this.hits.delete(k);
      }
      this.lastSweep = now;
    }

    const ip =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip ??
      req.socket?.remoteAddress ??
      'unknown';
    const route: string = req.route?.path ?? req.url ?? 'unknown';
    const key = `${req.method}:${route}:${ip}`;

    const stamps = (this.hits.get(key) ?? []).filter((t) => now - t < ttl);
    if (stamps.length >= limit) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    stamps.push(now);
    this.hits.set(key, stamps);
    return true;
  }
}
