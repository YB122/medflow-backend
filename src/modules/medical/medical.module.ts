import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MedicalRecord, MedicalRecordSchema, Prescription, PrescriptionSchema } from './schemas/medical.schema.js';
import { MedicalController } from './medical.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: Prescription.name, schema: PrescriptionSchema },
    ]),
  ],
  controllers: [MedicalController],
})
export class MedicalModule {}
