import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment, PaymentDocument, PaymentStatus } from './schemas/payment.schema.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@Controller('payments')
export class PaymentsController {
  constructor(@InjectModel(Payment.name) private payments: Model<PaymentDocument>) {}

  /** Create a pending payment intent for an appointment (provider integration = next step). */
  @Post('intent')
  @Roles('PATIENT', 'ADMIN', 'SUPER_ADMIN')
  intent(@Body() body: { appointmentId: string; amount: number; currency?: string }) {
    return this.payments.findOneAndUpdate(
      { appointmentId: body.appointmentId },
      { $setOnInsert: { ...body, currency: body.currency ?? 'USD', status: PaymentStatus.PENDING } },
      { upsert: true, new: true },
    );
  }

  @Get('appointment/:appointmentId')
  @Roles('PATIENT', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN', 'STAFF')
  one(@Param('appointmentId') appointmentId: string) {
    return this.payments.findOne({ appointmentId }).lean().exec();
  }
}
