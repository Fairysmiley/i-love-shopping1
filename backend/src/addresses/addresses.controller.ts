import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AddressesService } from './addresses.service';
import { AddressDto } from './dto/address.dto';

@ApiTags('addresses')
@ApiBearerAuth()
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's saved addresses" })
  list(@CurrentUser('userId') userId: string) {
    return this.addresses.list(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Save a new address' })
  create(@CurrentUser('userId') userId: string, @Body() dto: AddressDto) {
    return this.addresses.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a saved address' })
  update(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: AddressDto) {
    return this.addresses.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a saved address' })
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.addresses.remove(userId, id);
  }
}
