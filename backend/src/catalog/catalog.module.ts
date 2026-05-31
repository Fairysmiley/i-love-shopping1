import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ProductsController, CategoriesController, BrandsController, ReviewsController],
  providers: [ProductsService, CategoriesService, BrandsService, ReviewsService],
  exports: [ProductsService],
})
export class CatalogModule {}
