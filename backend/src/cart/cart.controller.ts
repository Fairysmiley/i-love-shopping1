import { Controller, Get, Post, Body, Patch, Param, Delete, Req } from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto, MergeCartDto, UpdateCartItemDto } from './dto/cart.dto';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private extractIds(req: Request, user: any) {
    const userId = user?.userId;
    const guestId = req.headers['x-guest-cart-id'] as string;
    return { userId, guestId };
  }

  @Public()
  @Get()
  getCart(@Req() req: Request, @CurrentUser() user: any) {
    const { userId, guestId } = this.extractIds(req, user);
    return this.cartService.getCart(userId, guestId);
  }

  @Public()
  @Post('items')
  addItem(@Req() req: Request, @CurrentUser() user: any, @Body() dto: AddToCartDto) {
    const { userId, guestId } = this.extractIds(req, user);
    return this.cartService.addItem(dto, userId, guestId);
  }

  @Public()
  @Patch('items/:productId')
  updateItem(
    @Req() req: Request,
    @CurrentUser() user: any,
    @Param('productId') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const { userId, guestId } = this.extractIds(req, user);
    return this.cartService.updateItem(productId, dto, userId, guestId);
  }

  @Public()
  @Delete('items/:productId')
  removeItem(@Req() req: Request, @CurrentUser() user: any, @Param('productId') productId: string) {
    const { userId, guestId } = this.extractIds(req, user);
    return this.cartService.removeItem(productId, userId, guestId);
  }

  @Post('merge')
  mergeCart(@CurrentUser() user: any, @Body() dto: MergeCartDto) {
    // This route is NOT @Public(), so user is guaranteed to be authenticated
    return this.cartService.mergeCart(dto.guestCartId, user.userId);
  }
}
