import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { BookAppointmentDto, RescheduleDto } from './dto/appointment.dto.js';

@Controller()
export class AppointmentsController {
  constructor(private readonly appts: AppointmentsService) {}

  @Public()
  @Get('appointments/slots')
  slots(@Query('doctorId') doctorId: string, @Query('date') date: string) {
    return this.appts.availableSlots(doctorId, date);
  }

  @Post('appointments')
  @Roles('PATIENT', 'ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('appointment:create')
  book(@CurrentUser() user: AuthUser, @Body() dto: BookAppointmentDto) {
    return this.appts.book(user.sub, dto.doctorId, dto.date, dto.start, dto.reason ?? '');
  }

  @Get('appointments/mine')
  @Roles('PATIENT', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN', 'STAFF')
  mine(
    @CurrentUser() user: AuthUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
  ) {
    if (user.roles.includes('DOCTOR')) {
      // In v1 doctorId === user doctor profile id passed explicitly; fallback to own appointments
      return this.appts.historyForDoctor(user.sub, Number(page), Number(limit), status);
    }
    return this.appts.historyForPatient(user.sub, Number(page), Number(limit), status);
  }

  @Get('appointments/:id')
  @Roles('PATIENT', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN', 'STAFF')
  one(@Param('id') id: string) {
    return this.appts.getById(id);
  }

  @Patch('appointments/:id/approve')
  @Roles('DOCTOR', 'ADMIN', 'SUPER_ADMIN', 'STAFF')
  @RequirePermissions('appointment:approve')
  approve(@Param('id') id: string) {
    return this.appts.approve(id);
  }

  @Patch('appointments/:id/reject')
  @Roles('DOCTOR', 'ADMIN', 'SUPER_ADMIN', 'STAFF')
  @RequirePermissions('appointment:approve')
  reject(@Param('id') id: string) {
    return this.appts.reject(id);
  }

  @Patch('appointments/:id/complete')
  @Roles('DOCTOR', 'ADMIN', 'SUPER_ADMIN')
  @RequirePermissions('appointment:approve')
  complete(@Param('id') id: string) {
    return this.appts.complete(id);
  }

  @Patch('appointments/:id/cancel')
  @Roles('PATIENT', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN', 'STAFF')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Ownership enforced in service (patient owns it, or doctor/staff/admin).
    return this.appts.cancel(id, user.sub, user.roles);
  }

  @Patch('appointments/:id/reschedule')
  @Roles('PATIENT', 'ADMIN', 'SUPER_ADMIN')
  reschedule(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: RescheduleDto,
  ) {
    return this.appts.reschedule(id, user.sub, dto.date, dto.start);
  }
}
