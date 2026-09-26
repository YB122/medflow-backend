import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MedicalRecord, MedicalRecordDocument, Prescription, PrescriptionDocument } from './schemas/medical.schema.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';

@Controller('records')
export class MedicalController {
  constructor(
    @InjectModel(MedicalRecord.name) private records: Model<MedicalRecordDocument>,
    @InjectModel(Prescription.name) private prescriptions: Model<PrescriptionDocument>,
  ) {}

  /** Doctor writes medical notes for a patient (optionally linked to appointment). */
  @Post()
  @Roles('DOCTOR', 'ADMIN', 'SUPER_ADMIN')
  create(@Body() body: { patientId: string; doctorId: string; appointmentId?: string; notes?: string; diagnosis?: string }) {
    return this.records.create(body);
  }

  @Get('patient/:patientId')
  @Roles('DOCTOR', 'PATIENT', 'ADMIN', 'SUPER_ADMIN', 'STAFF')
  byPatient(
    @Param('patientId') patientId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.paginate(this.records.find({ patientId }), Number(page), Number(limit));
  }

  @Post(':recordId/prescriptions')
  @Roles('DOCTOR', 'ADMIN', 'SUPER_ADMIN')
  prescribe(
    @Param('recordId') recordId: string,
    @Body() body: { medication: string; dosage?: string; instructions?: string },
  ) {
    return this.prescriptions.create({ recordId, ...body });
  }

  @Get(':recordId/prescriptions')
  @Roles('DOCTOR', 'PATIENT', 'ADMIN', 'SUPER_ADMIN', 'STAFF')
  scripts(
    @Param('recordId') recordId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.paginate(this.prescriptions.find({ recordId }), Number(page), Number(limit));
  }

  @Get('me')
  @Roles('PATIENT')
  myRecords(
    @CurrentUser() user: AuthUser,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.paginate(
      this.records.find({ patientId: user.sub }),
      Number(page),
      Number(limit),
    );
  }

  /** Newest-first paginated helper shared by the list endpoints above. */
  private async paginate(query: any, page: number, limit: number) {
    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(100, Math.max(1, limit || 20));
    const [items, total] = await Promise.all([
      query
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean()
        .exec(),
      query.model.countDocuments(query.getFilter()),
    ]);
    return { items, total, page: safePage, limit: safeLimit };
  }
}
