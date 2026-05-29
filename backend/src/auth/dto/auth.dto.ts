import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PASSWORD_RULE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

export class RegisterDto {
  @ApiProperty({ example: 'shopper@example.com' })
  @IsEmail({}, { message: 'A valid email address is required.' })
  email!: string;

  @ApiProperty({
    example: 'Str0ng!Passw0rd',
    description:
      'Min 10 chars with upper, lower, number and symbol. Keeps accounts safe without being absurd.',
  })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters.' })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, {
    message:
      'Password must include uppercase, lowercase, a number and a special character.',
  })
  password!: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  @IsNotEmpty({ message: 'First name is required.' })
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required.' })
  @MaxLength(80)
  lastName!: string;

  @ApiPropertyOptional({ description: 'Google reCAPTCHA token from the client.' })
  @IsOptional()
  @IsString()
  captchaToken?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'shopper@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Str0ng!Passw0rd' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ description: 'TOTP code, required if 2FA is enabled.' })
  @IsOptional()
  @IsString()
  twoFactorCode?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'shopper@example.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'Str0ng!Passw0rd' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(PASSWORD_RULE, {
    message:
      'Password must include uppercase, lowercase, a number and a special character.',
  })
  newPassword!: string;
}

export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}
