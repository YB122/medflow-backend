import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';

@Controller('conversations')
@Roles('PATIENT', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  mine(@CurrentUser() user: AuthUser) {
    return this.chat.myConversations(user.sub);
  }

  @Post()
  open(@CurrentUser() user: AuthUser, @Body() body: { patientId?: string; doctorId?: string }) {
    // Patient opens with doctorId; doctor opens with patientId; admin passes both.
    const patientId = body.patientId ?? user.sub;
    const doctorId = body.doctorId ?? user.sub;
    return this.chat.getOrCreate(patientId, doctorId);
  }

  @Get(':id/messages')
  history(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.chat.history(id, user.sub, Number(page), Number(limit));
  }

  @Post(':id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { text: string }) {
    return this.chat.send(id, user.sub, body.text);
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chat.markRead(id, user.sub);
  }

  @Get('presence/:userId')
  presence(@Param('userId') userId: string) {
    return { userId, online: this.chat.isOnline(userId) };
  }
}
