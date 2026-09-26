import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * Role check: user must have AT LEAST ONE of the required roles.
 * SUPER_ADMIN bypasses all role checks.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as { roles?: string[] } | undefined;
    const roles: string[] = user?.roles ?? [];
    if (roles.includes('SUPER_ADMIN')) return true;
    return required.some((r) => roles.includes(r));
  }
}
