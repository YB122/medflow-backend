import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';

@Controller('notifications')
@Roles('PATIENT', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN', 'STAFF')
export class NotificationsController {
  constructor(private readonly notifs: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('unread') unread?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.notifs.list(user.sub, unread === 'true', Number(page), Number(limit));
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifs.markRead(user.sub, id);
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifs.markAllRead(user.sub);
  }
}
