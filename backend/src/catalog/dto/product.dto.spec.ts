import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './product.dto';
import { ProductQueryDto, ProductSort } from './product-query.dto';

async function errorsFor<T extends object>(cls: new () => T, payload: object): Promise<string[]> {
  const dto = plainToInstance(cls, payload);
  const errors = await validate(dto as object, { whitelist: true, forbidNonWhitelisted: true });
  // Flatten constraints across the (possibly nested) error tree.
  const collect = (errs: typeof errors): string[] =>
    errs.flatMap((e) => [
      ...Object.values(e.constraints ?? {}),
      ...collect(e.children ?? []),
    ]);
  return collect(errors);
}

describe('Product data model validation', () => {
  const valid = {
    name: 'Fjällräven Keb Eco-Shell Jacket',
    description: 'Pre-loved 3-layer hardshell.',
    price: 289.0,
    stockQuantity: 1,
    categoryId: 'cat-id',
    brandId: 'brand-id',
    weightGrams: 520,
    lengthMm: 340,
    images: [{ url: 'https://example.com/a.jpg', isPrimary: true }],
    attributes: [{ name: 'condition', value: 'Very Good' }],
  };

  describe('CreateProductDto', () => {
    it('accepts a fully-formed product', async () => {
      expect(await errorsFor(CreateProductDto, valid)).toHaveLength(0);
    });

    it('requires the core fields (name, description, price, stock, category, brand)', async () => {
      const errs = await errorsFor(CreateProductDto, {});
      const joined = errs.join(' ');
      expect(joined).toMatch(/name/i);
      expect(joined).toMatch(/description/i);
      expect(joined).toMatch(/price/i);
      expect(joined).toMatch(/stockQuantity/i);
      expect(joined).toMatch(/categoryId/i);
      expect(joined).toMatch(/brandId/i);
    });

    it('rejects a negative price', async () => {
      expect((await errorsFor(CreateProductDto, { ...valid, price: -5 })).length).toBeGreaterThan(0);
    });

    it('rejects a non-integer / negative stock quantity', async () => {
      expect((await errorsFor(CreateProductDto, { ...valid, stockQuantity: -1 })).length).toBeGreaterThan(0);
      expect((await errorsFor(CreateProductDto, { ...valid, stockQuantity: 2.5 })).length).toBeGreaterThan(0);
    });

    it('validates nested image and attribute structures', async () => {
      const badImages = await errorsFor(CreateProductDto, {
        ...valid,
        images: [{ url: 123 }],
      });
      expect(badImages.length).toBeGreaterThan(0);

      const badAttrs = await errorsFor(CreateProductDto, {
        ...valid,
        attributes: [{ name: '', value: '' }],
      });
      expect(badAttrs.length).toBeGreaterThan(0);
    });
  });

  describe('ProductQueryDto (faceted search + sorting input)', () => {
    it('defaults sort to relevance and paginates', () => {
      const dto = plainToInstance(ProductQueryDto, {});
      expect(dto.sort).toBe(ProductSort.RELEVANCE);
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(20);
    });

    it('coerces numeric query params and parses CSV facets', () => {
      const dto = plainToInstance(ProductQueryDto, {
        minPrice: '100',
        maxPrice: '300',
        brands: 'fjallraven,haglofs',
        attributes: 'size:M,condition:Very Good',
        page: '2',
      });
      expect(dto.minPrice).toBe(100);
      expect(dto.maxPrice).toBe(300);
      expect(dto.brands).toEqual(['fjallraven', 'haglofs']);
      expect(dto.attributes).toEqual(['size:M', 'condition:Very Good']);
      expect(dto.skip).toBe(20);
    });

    it('accepts valid sort options', async () => {
      expect(await errorsFor(ProductQueryDto, { sort: 'price_desc' })).toHaveLength(0);
      const dto = plainToInstance(ProductQueryDto, { sort: 'price_asc' });
      expect(dto.sort).toBe(ProductSort.PRICE_ASC);
    });

    it('rejects an unknown sort option', async () => {
      const errs = await errorsFor(ProductQueryDto, { sort: 'cheapest' });
      expect(errs.length).toBeGreaterThan(0);
    });

    it('rejects an out-of-range limit', async () => {
      expect((await errorsFor(ProductQueryDto, { limit: 9999 })).length).toBeGreaterThan(0);
    });
  });
});
