import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto';

interface GuestCartItem {
  productId: string;
  quantity: number;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private guestCartKey(guestId: string) {
    return `cart:guest:${guestId}`;
  }

  async getCart(userId?: string, guestId?: string) {
    let items: { productId: string; quantity: number }[] = [];

    if (userId) {
      const cart = await this.prisma.cart.findFirst({
        where: { userId },
        include: { items: true },
      });
      if (cart) {
        items = cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
      }
    } else if (guestId) {
      const data = await this.redis.get(this.guestCartKey(guestId));
      if (data) {
        items = JSON.parse(data);
      }
    } else {
      return { items: [], total: 0 };
    }

    if (items.length === 0) return { items: [], total: 0 };

    // Fetch product details to calculate totals
    const productIds = items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { images: { where: { isPrimary: true }, take: 1 } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    let total = 0;

    const enrichedItems = items
      .map((item) => {
        const p = productMap.get(item.productId);
        if (!p) return null;
        const itemTotal = Number(p.price) * item.quantity;
        total += itemTotal;
        return {
          ...item,
          product: {
            id: p.id,
            name: p.name,
            slug: p.slug,
            price: Number(p.price),
            stockQuantity: p.stockQuantity,
            image: p.images[0]?.thumbnailUrl || p.images[0]?.url || null,
          },
          itemTotal,
        };
      })
      .filter((i) => i !== null);

    return { items: enrichedItems, total };
  }

  async addItem(dto: AddToCartDto, userId?: string, guestId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.quantity > product.stockQuantity) {
      throw new BadRequestException(
        `Cannot add ${dto.quantity}. Only ${product.stockQuantity} in stock.`,
      );
    }

    if (userId) {
      let cart = await this.prisma.cart.findFirst({ where: { userId } });
      if (!cart) {
        cart = await this.prisma.cart.create({ data: { userId } });
      }

      const existingItem = await this.prisma.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: dto.productId } },
      });

      const newQty = (existingItem?.quantity || 0) + dto.quantity;
      if (newQty > product.stockQuantity) {
        throw new BadRequestException(
          `Cannot add more. Exceeds stock of ${product.stockQuantity}.`,
        );
      }

      if (existingItem) {
        await this.prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: newQty },
        });
      } else {
        await this.prisma.cartItem.create({
          data: { cartId: cart.id, productId: dto.productId, quantity: dto.quantity },
        });
      }
    } else if (guestId) {
      const key = this.guestCartKey(guestId);
      const data = await this.redis.get(key);
      const items: GuestCartItem[] = data ? JSON.parse(data) : [];

      const existing = items.find((i) => i.productId === dto.productId);
      const newQty = (existing?.quantity || 0) + dto.quantity;

      if (newQty > product.stockQuantity) {
        throw new BadRequestException(
          `Cannot add more. Exceeds stock of ${product.stockQuantity}.`,
        );
      }

      if (existing) {
        existing.quantity = newQty;
      } else {
        items.push({ productId: dto.productId, quantity: dto.quantity });
      }

      await this.redis.setEx(key, JSON.stringify(items), 7 * 24 * 60 * 60); // 7 days
    }

    return this.getCart(userId, guestId);
  }

  async updateItem(productId: string, dto: UpdateCartItemDto, userId?: string, guestId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.quantity > product.stockQuantity) {
      throw new BadRequestException(
        `Cannot update to ${dto.quantity}. Only ${product.stockQuantity} in stock.`,
      );
    }

    if (userId) {
      const cart = await this.prisma.cart.findFirst({ where: { userId } });
      if (!cart) throw new NotFoundException('Cart not found');

      const item = await this.prisma.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId } },
      });
      if (!item) throw new NotFoundException('Item not in cart');

      await this.prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity: dto.quantity },
      });
    } else if (guestId) {
      const key = this.guestCartKey(guestId);
      const data = await this.redis.get(key);
      if (!data) throw new NotFoundException('Cart not found');

      const items: GuestCartItem[] = JSON.parse(data);
      const item = items.find((i) => i.productId === productId);
      if (!item) throw new NotFoundException('Item not in cart');

      item.quantity = dto.quantity;
      await this.redis.setEx(key, JSON.stringify(items), 7 * 24 * 60 * 60);
    }

    return this.getCart(userId, guestId);
  }

  async removeItem(productId: string, userId?: string, guestId?: string) {
    if (userId) {
      const cart = await this.prisma.cart.findFirst({ where: { userId } });
      if (cart) {
        await this.prisma.cartItem.deleteMany({
          where: { cartId: cart.id, productId },
        });
      }
    } else if (guestId) {
      const key = this.guestCartKey(guestId);
      const data = await this.redis.get(key);
      if (data) {
        let items: GuestCartItem[] = JSON.parse(data);
        items = items.filter((i) => i.productId !== productId);
        await this.redis.setEx(key, JSON.stringify(items), 7 * 24 * 60 * 60);
      }
    }
    return this.getCart(userId, guestId);
  }

  /** Raw {productId, quantity} pairs for a guest cart — used by checkout. */
  async getGuestItems(guestId: string): Promise<GuestCartItem[]> {
    const data = await this.redis.get(this.guestCartKey(guestId));
    return data ? JSON.parse(data) : [];
  }

  /** Clears a guest cart after a successful guest checkout. */
  async clearGuestCart(guestId: string): Promise<void> {
    await this.redis.del(this.guestCartKey(guestId));
  }

  async mergeCart(guestId: string, userId: string) {
    const key = this.guestCartKey(guestId);
    const data = await this.redis.get(key);
    if (!data) return this.getCart(userId);

    const guestItems: GuestCartItem[] = JSON.parse(data);
    if (guestItems.length === 0) return this.getCart(userId);

    let cart = await this.prisma.cart.findFirst({ where: { userId } });
    if (!cart) {
      cart = await this.prisma.cart.create({ data: { userId } });
    }

    // Merge logic: For each guest item, add it to DB if stock permits
    for (const gi of guestItems) {
      const product = await this.prisma.product.findUnique({ where: { id: gi.productId } });
      if (!product || product.stockQuantity === 0) continue;

      const existingItem = await this.prisma.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: gi.productId } },
      });

      const newQty = Math.min((existingItem?.quantity || 0) + gi.quantity, product.stockQuantity);

      if (existingItem) {
        await this.prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: newQty },
        });
      } else {
        await this.prisma.cartItem.create({
          data: { cartId: cart.id, productId: gi.productId, quantity: newQty },
        });
      }
    }

    // Clear guest cart after merge
    await this.redis.del(key);

    return this.getCart(userId);
  }
}
