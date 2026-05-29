export interface Dimensions {
  metric: {
    weightGrams: number | null;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
  };
  imperial: {
    weightOz: number | null;
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
  };
}

const GRAMS_PER_OUNCE = 28.349523125;
const MM_PER_INCH = 25.4;

const round = (n: number, dp = 2): number => {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
};

const mmToIn = (mm: number | null): number | null => (mm == null ? null : round(mm / MM_PER_INCH));
const gToOz = (g: number | null): number | null =>
  g == null ? null : round(g / GRAMS_PER_OUNCE);

/** Builds the dual metric/imperial dimensions view from canonical metric data. */
export function buildDimensions(p: {
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
}): Dimensions {
  return {
    metric: {
      weightGrams: p.weightGrams,
      lengthMm: p.lengthMm,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
    },
    imperial: {
      weightOz: gToOz(p.weightGrams),
      lengthIn: mmToIn(p.lengthMm),
      widthIn: mmToIn(p.widthMm),
      heightIn: mmToIn(p.heightMm),
    },
  };
}
