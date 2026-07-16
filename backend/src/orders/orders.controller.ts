import { Controller, Get, Post, Body, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderFilterDto, UpdateOrderStatusDto } from './dto/order.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async getUserOrders(@CurrentUser() user: any, @Query() filter: OrderFilterDto) {
    return this.ordersService.getUserOrders(user.userId, filter);
  }

  @Get('all')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  async getAllOrders(@Query() filter: OrderFilterDto) {
    return this.ordersService.getAllOrders(filter);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string, @CurrentUser() user: any) {
    const isAdmin = user.role === Role.ADMIN;
    return this.ordersService.getOrderById(id, user.userId, isAdmin);
  }

  @Post(':id/cancel')
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: any) {
    const isAdmin = user.role === Role.ADMIN;
    return this.ordersService.cancelOrder(id, user.userId, isAdmin);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  async updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateOrderStatus(id, dto);
  }

  @Post(':id/refund')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  async processRefund(@Param('id') id: string) {
    return this.ordersService.processRefund(id);
  }
}
