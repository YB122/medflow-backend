import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';

/**
 * Permission check: user must have ALL required permissions.
 * SUPER_ADMIN bypasses all permission checks.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as { permissions?: string[]; roles?: string[] } | undefined;
    const perms: string[] = user?.permissions ?? [];
    if (user?.roles?.includes('SUPER_ADMIN')) return true;
    return required.every((p) => perms.includes(p));
  }
}
