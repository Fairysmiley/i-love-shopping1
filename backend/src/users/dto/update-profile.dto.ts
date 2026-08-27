import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Deliberately narrow — only the fields a user may self-edit. Role, email,
// isActive etc. are NOT here, so this DTO can never be used to mass-assign
// privileged fields even if a controller were careless with it.
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'First name cannot be empty.' })
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Lovelace' })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Last name cannot be empty.' })
  @MaxLength(80)
  lastName?: string;
}
