import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CheckoutDto {
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @IsBoolean()
  @IsOptional()
  simulatePaymentFailure?: boolean;

  @IsString()
  @IsOptional()
  shippingAddress?: string;
}
