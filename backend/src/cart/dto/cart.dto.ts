import { IsInt, IsNotEmpty, IsString, IsUUID, Min } from 'class-validator';

export class AddToCartDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsInt({ message: 'Quantity must be a whole number.' })
  @Min(1)
  quantity: number;
}

export class UpdateCartItemDto {
  @IsInt({ message: 'Quantity must be a whole number.' })
  @Min(1)
  quantity: number;
}

export class MergeCartDto {
  @IsString()
  @IsNotEmpty()
  guestCartId: string;
}
