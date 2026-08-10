import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export enum ContactSubject {
  ORDER = 'order',
  PRODUCT = 'product',
  RETURNS = 'returns',
  OTHER = 'other',
}

export class ContactMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsEnum(ContactSubject)
  subject: ContactSubject;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message: string;
}
