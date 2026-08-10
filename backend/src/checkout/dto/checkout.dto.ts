import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Structured shipping address. Splitting into fields (rather than one free
 * text blob) lets us validate format/plausibility per field — syntactic
 * validation (types, lengths, postal code pattern) and basic semantic
 * validation (postal code must look right for a real address).
 */
export class ShippingAddressDto {
  @IsString()
  @IsNotEmpty({ message: 'Street address is required.' })
  @MaxLength(200)
  street: string;

  @IsString()
  @IsNotEmpty({ message: 'City is required.' })
  @MaxLength(100)
  city: string;

  @IsString()
  @IsNotEmpty({ message: 'Postal code is required.' })
  @Matches(/^[A-Za-z0-9][A-Za-z0-9\s-]{1,10}$/, {
    message: 'Postal code format looks invalid.',
  })
  postalCode: string;

  @IsString()
  @IsNotEmpty({ message: 'Country is required.' })
  @MaxLength(100)
  country: string;
}

export class CheckoutDto {
  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @IsUUID()
  @IsNotEmpty({ message: 'Please choose a shipping option.' })
  deliveryOptionId: string;

  /** Required for guest checkout (no account to send the confirmation to). */
  @IsEmail({}, { message: 'A valid email is required to receive your order confirmation.' })
  @IsOptional()
  email?: string;
}
