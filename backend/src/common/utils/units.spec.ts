import { buildDimensions } from './units';

describe('buildDimensions (product data model)', () => {
  it('exposes canonical metric values and derives imperial', () => {
    const dims = buildDimensions({
      weightGrams: 1000,
      lengthMm: 254,
      widthMm: 127,
      heightMm: null,
    });

    expect(dims.metric).toEqual({
      weightGrams: 1000,
      lengthMm: 254,
      widthMm: 127,
      heightMm: null,
    });
    // 1000 g / 28.349523125 ≈ 35.27 oz
    expect(dims.imperial.weightOz).toBeCloseTo(35.27, 1);
    // 254 mm / 25.4 = 10 in
    expect(dims.imperial.lengthIn).toBe(10);
    expect(dims.imperial.widthIn).toBeCloseTo(5, 1);
    expect(dims.imperial.heightIn).toBeNull();
  });

  it('returns nulls when no metric data is present', () => {
    const dims = buildDimensions({
      weightGrams: null,
      lengthMm: null,
      widthMm: null,
      heightMm: null,
    });
    expect(dims.imperial.weightOz).toBeNull();
    expect(dims.imperial.lengthIn).toBeNull();
  });
});
