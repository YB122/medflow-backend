import { PermissionsGuard } from './permissions.guard.js';
import { Reflector } from '@nestjs/core';

const reflector = (perms?: string[]) =>
  ({ getAllAndOverride: () => perms }) as unknown as Reflector;

const ctx = (user: any) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

describe('PermissionsGuard', () => {
  it('allows when no permissions required', () => {
    const guard = new PermissionsGuard(reflector(undefined));
    expect(guard.canActivate(ctx({ permissions: [] }))).toBe(true);
  });

  it('requires ALL permissions (not just one)', () => {
    const guard = new PermissionsGuard(reflector(['user:read', 'user:update']));
    expect(
      guard.canActivate(ctx({ roles: [], permissions: ['user:read'] })),
    ).toBe(false);
    expect(
      guard.canActivate(ctx({ roles: [], permissions: ['user:read', 'user:update'] })),
    ).toBe(true);
  });

  it('SUPER_ADMIN bypasses permission checks', () => {
    const guard = new PermissionsGuard(reflector(['user:read']));
    expect(guard.canActivate(ctx({ roles: ['SUPER_ADMIN'], permissions: [] }))).toBe(true);
  });

  it('doctor cannot approve without permission', () => {
    const guard = new PermissionsGuard(reflector(['appointment:approve']));
    expect(guard.canActivate(ctx({ roles: ['PATIENT'], permissions: ['appointment:create'] }))).toBe(
      false,
    );
  });
});
