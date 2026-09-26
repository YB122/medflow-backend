import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { UserStatus } from './schemas/user.schema.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Admin-only listing. Proves RBAC: PATIENT gets 403. */
  @Get()
  @Roles('ADMIN', 'SUPER_ADMIN', 'STAFF')
  @RequirePermissions('user:read')
  list(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.users.list(Number(page), Number(limit));
  }

  /** Update your OWN phone number (no admin permission needed). */
  @Patch('me')
  @Roles('PATIENT', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN', 'STAFF')
  updateMe(@CurrentUser() user: AuthUser, @Body() body: { phone?: string }) {
    return this.users.updatePhone(user.sub, body.phone);
  }

  /** Suspend / reactivate a user account. */
  @Patch(':id/status')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('user:update')
  setStatus(@Param('id') id: string, @Body() body: { status: UserStatus }) {
    return this.users.setStatus(id, body.status);
  }

  /** Assign roles to a user. */
  @Post(':id/roles')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('role:assign')
  setRoles(@Param('id') id: string, @Body() body: { roles: string[] }) {
    return this.users.setRoles(id, body.roles ?? []);
  }
}
