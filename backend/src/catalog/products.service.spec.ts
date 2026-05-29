import { Prisma } from '@prisma/client';
import { ProductsService } from './products.service';

/**
 * Unit tests for the product data model's public shape — the structure the API
 * exposes for every product, including dual metric/imperial dimensions and
 * derived fields. Pure mapping logic, so no DB/Redis is needed.
 */
describe('ProductsService.toPublic (product data model shape)', () => {
  // Constructor deps are unused by toPublic; pass stubs.
  const service = new ProductsService({} as any, {} as any);

  const fullProduct: any = {
    id: 'p1',
    name: 'Haglöfs L.I.M Down Jacket',
    slug: 'haglofs-l-i-m-down-jacket',
    description: 'Ultralight down jacket.',
    price: new Prisma.Decimal('175.00'),
    currency: 'EUR',
    stockQuantity: 1,
    weightGrams: 1000,
    lengthMm: 254,
    widthMm: 127,
    heightMm: null,
    averageRating: 4.9,
    ratingCount: 33,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    category: { id: 'c1', name: 'Down & Insulation', slug: 'down-insulation' },
    brand: { id: 'b1', name: 'Haglöfs', slug: 'haglofs' },
    images: [{ url: 'https://x/y.jpg', altText: 'jacket', isPrimary: true }],
    attributes: [
      { name: 'condition', value: 'Like New' },
      { name: 'size', value: 'L' },
      { name: 'authenticity', value: 'Verified' },
    ],
  };

  it('exposes all required product fields', () => {
    const dto = service.toPublic(fullProduct);
    expect(dto).toEqual(
      expect.objectContaining({
        id: 'p1',
        name: 'Haglöfs L.I.M Down Jacket',
        slug: 'haglofs-l-i-m-down-jacket',
        description: 'Ultralight down jacket.',
        currency: 'EUR',
        stockQuantity: 1,
        averageRating: 4.9,
        ratingCount: 33,
      }),
    );
    expect(dto.category).toEqual({ id: 'c1', name: 'Down & Insulation', slug: 'down-insulation' });
    expect(dto.brand).toEqual({ id: 'b1', name: 'Haglöfs', slug: 'haglofs' });
  });

  it('converts the Decimal price into a JS number', () => {
    const dto = service.toPublic(fullProduct);
    expect(typeof dto.price).toBe('number');
    expect(dto.price).toBe(175);
  });

  it('derives inStock from stock quantity', () => {
    expect(service.toPublic(fullProduct).inStock).toBe(true);
    expect(service.toPublic({ ...fullProduct, stockQuantity: 0 }).inStock).toBe(false);
  });

  it('provides dimensions in both metric and imperial units', () => {
    const { dimensions } = service.toPublic(fullProduct);
    expect(dimensions.metric).toEqual({
      weightGrams: 1000,
      lengthMm: 254,
      widthMm: 127,
      heightMm: null,
    });
    expect(dimensions.imperial.lengthIn).toBe(10); // 254 mm
    expect(dimensions.imperial.weightOz).toBeCloseTo(35.27, 1);
    expect(dimensions.imperial.heightIn).toBeNull();
  });

  it('maps images and faceted attributes', () => {
    const dto = service.toPublic(fullProduct);
    expect(dto.images).toEqual([{ url: 'https://x/y.jpg', altText: 'jacket', isPrimary: true }]);
    expect(dto.attributes).toEqual([
      { name: 'condition', value: 'Like New' },
      { name: 'size', value: 'L' },
      { name: 'authenticity', value: 'Verified' },
    ]);
  });
});
