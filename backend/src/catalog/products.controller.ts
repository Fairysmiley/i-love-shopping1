import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ProductsService } from './products.service';
import { ProductQueryDto } from './dto/product-query.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Search/browse products with faceted filters + sorting' })
  search(@Query() query: ProductQueryDto) {
    return this.products.search(query);
  }

  @Public()
  @SkipThrottle()
  @Get('suggest')
  @ApiOperation({ summary: 'Dynamic search suggestions (type-ahead)' })
  @ApiQuery({ name: 'q', required: true })
  suggest(@Query('q') q: string) {
    return this.products.suggest(q ?? '');
  }

  @Public()
  @SkipThrottle()
  @Get('facets')
  @ApiOperation({ summary: 'Available facet values + counts for the current filters' })
  facets(@Query() query: ProductQueryDto) {
    return this.products.facets(query);
  }

  @Public()
  @SkipThrottle()
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get a single product by id or slug' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.products.findByIdOrSlug(idOrSlug);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a product (admin)' })
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a product (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a product (admin)' })
  remove(@Param('id') id: string) {
    return this.products.remove(id);
  }
}
