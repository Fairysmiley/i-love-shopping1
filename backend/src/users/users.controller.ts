import { Controller, Delete, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user profile' })
  async me(@CurrentUser('userId') userId: string) {
    const user = await this.users.getByIdOrThrow(userId);
    return this.users.toPublic(user);
  }

  @Get('me/export')
  @ApiOperation({ summary: 'GDPR: export all personal data held for this account' })
  async exportData(@CurrentUser('userId') userId: string) {
    const user = await this.users.getByIdOrThrow(userId);
    // Minimal GDPR data-portability payload for the Foundation phase.
    return {
      exportedAt: new Date().toISOString(),
      profile: this.users.toPublic(user),
    };
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'GDPR: delete (deactivate) the current account' })
  async deleteAccount(@CurrentUser('userId') userId: string) {
    // Soft-delete keeps referential integrity for any historical orders (added
    // in the Commerce phase) while honoring the erasure request.
    await this.users.update(userId, {
      isActive: false,
      email: `deleted+${userId}@villi.invalid`,
      passwordHash: null,
      firstName: 'Deleted',
      lastName: 'User',
    });
  }
}
