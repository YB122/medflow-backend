import { RolesGuard } from './roles.guard.js';
import { Reflector } from '@nestjs/core';

const reflector = (roles?: string[]) =>
  ({ getAllAndOverride: () => roles }) as unknown as Reflector;

const ctxWithRoles = (roles: string[]) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  }) as any;

describe('RolesGuard', () => {
  it('allows when no roles required', () => {
    const guard = new RolesGuard(reflector(undefined));
    expect(guard.canActivate(ctxWithRoles([]))).toBe(true);
  });

  it('allows when user has one of required roles', () => {
    const guard = new RolesGuard(reflector(['ADMIN', 'STAFF']));
    expect(guard.canActivate(ctxWithRoles(['STAFF']))).toBe(true);
  });

  it('denies PATIENT accessing admin route', () => {
    const guard = new RolesGuard(reflector(['ADMIN']));
    expect(guard.canActivate(ctxWithRoles(['PATIENT']))).toBe(false);
  });

  it('SUPER_ADMIN bypasses role checks', () => {
    const guard = new RolesGuard(reflector(['ADMIN']));
    expect(guard.canActivate(ctxWithRoles(['SUPER_ADMIN']))).toBe(true);
  });
});
