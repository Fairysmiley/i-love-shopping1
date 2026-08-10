import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AddressDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  label?: string;

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
  @Matches(/^[A-Za-z0-9][A-Za-z0-9\s-]{1,10}$/, { message: 'Postal code format looks invalid.' })
  postalCode: string;

  @IsString()
  @IsNotEmpty({ message: 'Country is required.' })
  @MaxLength(100)
  country: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
