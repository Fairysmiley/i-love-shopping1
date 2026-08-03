import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { DeliveryOptionsService } from './delivery-options.service';
import { CreateDeliveryOptionDto, UpdateDeliveryOptionDto } from './dto/delivery-option.dto';

@ApiTags('delivery-options')
@Controller('delivery-options')
export class DeliveryOptionsController {
  constructor(private readonly deliveryOptions: DeliveryOptionsService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Get all delivery options' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(@Query('activeOnly') activeOnly?: string) {
    const active = activeOnly === 'true';
    return this.deliveryOptions.findAll(active);
  }

  @Public()
  @SkipThrottle()
  @Get(':id')
  @ApiOperation({ summary: 'Get a delivery option by ID' })
  findOne(@Param('id') id: string) {
    return this.deliveryOptions.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a delivery option (admin)' })
  create(@Body() dto: CreateDeliveryOptionDto) {
    return this.deliveryOptions.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a delivery option (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryOptionDto) {
    return this.deliveryOptions.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a delivery option (admin)' })
  remove(@Param('id') id: string) {
    return this.deliveryOptions.remove(id);
  }
}
