import { jest } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { ThrottlerGuard, THROTTLE_KEY } from './throttle.guard.js';

const reflectorWith = (override?: { limit: number; ttl: number }) =>
  ({ getAllAndOverride: jest.fn<any>().mockReturnValue(override) }) as any;

const httpCtx = (ip = '1.2.3.4', route = '/api/v1/auth/login') =>
  ({
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ ip, method: 'POST', route: { path: route }, headers: {}, socket: {} }),
    }),
  }) as any;

describe('ThrottlerGuard (in-house)', () => {
  it('allows under the limit, 429s past it', () => {
    const guard = new ThrottlerGuard(reflectorWith({ limit: 5, ttl: 60_000 }));
    const ctx = httpCtx();
    for (let i = 0; i < 5; i++) expect(guard.canActivate(ctx)).toBe(true);
    try {
      guard.canActivate(ctx);
      throw new Error('should have throttled');
    } catch (e: any) {
      expect(e?.status ?? e?.getStatus?.()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  it('tracks IPs independently', () => {
    const guard = new ThrottlerGuard(reflectorWith({ limit: 1, ttl: 60_000 }));
    expect(guard.canActivate(httpCtx('1.1.1.1'))).toBe(true);
    expect(guard.canActivate(httpCtx('2.2.2.2'))).toBe(true);
    expect(() => guard.canActivate(httpCtx('1.1.1.1'))).toThrow();
  });

  it('falls back to the global 100/60s default without route metadata', () => {
    const guard = new ThrottlerGuard(reflectorWith(undefined));
    for (let i = 0; i < 100; i++) expect(guard.canActivate(httpCtx())).toBe(true);
    expect(() => guard.canActivate(httpCtx())).toThrow();
  });

  it('skips non-http (websocket) contexts', () => {
    const guard = new ThrottlerGuard(reflectorWith({ limit: 1, ttl: 60_000 }));
    const ws: any = { getType: () => 'ws', getHandler: () => ({}), getClass: () => ({}) };
    expect(guard.canActivate(ws)).toBe(true);
    expect(guard.canActivate(ws)).toBe(true);
  });

  it('exposes the metadata key used by @Throttle', () => {
    expect(THROTTLE_KEY).toBe('medflow:throttle');
  });
});
