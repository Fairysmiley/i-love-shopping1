import { IsNotEmpty, IsNumber, IsString, IsUUID, Min } from 'class-validator';

export class AddToCartDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class UpdateCartItemDto {
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class MergeCartDto {
  @IsString()
  @IsNotEmpty()
  guestCartId: string;
}
