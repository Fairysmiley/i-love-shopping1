import { PrismaClient, Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main(): Promise<void> {
  console.log('Seeding Villi (verified pre-loved Nordic outdoor apparel)...');

  // --- Admin + demo customer ---
  const adminPassword = await argon2.hash('Admin!Passw0rd');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@villi.test' },
    update: {},
    create: {
      email: 'admin@villi.test',
      passwordHash: adminPassword,
      firstName: 'Site',
      lastName: 'Admin',
      role: Role.ADMIN,
      isEmailVerified: true,
    },
  });

  const customerPassword = await argon2.hash('Shopper!Passw0rd');
  const customer = await prisma.user.upsert({
    where: { email: 'shopper@villi.test' },
    update: {},
    create: {
      email: 'shopper@villi.test',
      passwordHash: customerPassword,
      firstName: 'Aino',
      lastName: 'Virtanen',
      isEmailVerified: true,
    },
  });

  // --- Categories (nested tree) ---
  const root = await prisma.category.upsert({
    where: { slug: 'outdoor-apparel' },
    update: {},
    create: {
      name: 'Outdoor Apparel',
      slug: 'outdoor-apparel',
      description: 'Verified pre-loved Nordic outdoor clothing and gear',
    },
  });

  const makeCategory = async (name: string, description: string) =>
    prisma.category.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name), parentId: root.id, description },
    });

  const shellJackets = await makeCategory('Shell Jackets', 'Waterproof and windproof shells');
  const insulation = await makeCategory('Down & Insulation', 'Down and synthetic insulated layers');
  const fleece = await makeCategory('Fleece & Midlayers', 'Warm, breathable midlayers');
  const trousers = await makeCategory('Trousers', 'Trekking and outdoor trousers');
  const backpacks = await makeCategory('Backpacks', 'Daypacks and trekking packs');

  // --- Brands (Finnish / Nordic design houses) ---
  const brandSeed = [
    'Fjällräven',
    'Haglöfs',
    'Luhta',
    'Sasta',
    'Halti',
    'Peak Performance',
    'Norrøna',
    'Klättermusen',
  ];
  const brands: Record<string, { id: string }> = {};
  for (const name of brandSeed) {
    brands[name] = await prisma.brand.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: {
        name,
        slug: slugify(name),
        description: `${name} — Nordic outdoor design`,
      },
    });
  }

  // --- Products (each pre-loved item is unique: stock = 1) ---
  type Seed = {
    name: string;
    description: string;
    price: number;
    categoryId: string;
    brand: string;
    weightGrams: number;
    // Packed dimensions in mm
    dims: [number, number, number];
    // Faceted attributes: condition + size + material + colour + authenticity etc.
    attributes: { name: string; value: string }[];
    rating: number;
    ratingCount: number;
    image: string;
  };

  const products: Seed[] = [
    {
      name: 'Fjällräven Keb Eco-Shell Jacket',
      description:
        'Pre-loved 3-layer Eco-Shell hardshell. Fully taped seams, pit zips, helmet-compatible hood. Independently authenticated; minor wear at the cuffs.',
      price: 289.0,
      categoryId: shellJackets.id,
      brand: 'Fjällräven',
      weightGrams: 520,
      dims: [340, 280, 90],
      attributes: [
        { name: 'condition', value: 'Very Good' },
        { name: 'size', value: 'M' },
        { name: 'gender', value: 'Mens' },
        { name: 'colour', value: 'Ocean Blue' },
        { name: 'material', value: 'Recycled Polyester' },
        { name: 'authenticity', value: 'Verified' },
      ],
      rating: 4.8,
      ratingCount: 41,
      image: '/products/keb-shell.png',
    },
    {
      name: 'Fjällräven Kånken 16L Backpack',
      description:
        'Iconic Kånken daypack in Vinylon F. Gently used with honest patina; zips and straps fully functional. Authenticated against batch markings.',
      price: 64.0,
      categoryId: backpacks.id,
      brand: 'Fjällräven',
      weightGrams: 300,
      dims: [380, 270, 130],
      attributes: [
        { name: 'condition', value: 'Good' },
        { name: 'size', value: 'One Size' },
        { name: 'gender', value: 'Unisex' },
        { name: 'colour', value: 'Frost Green' },
        { name: 'material', value: 'Vinylon F' },
        { name: 'authenticity', value: 'Verified' },
      ],
      rating: 4.6,
      ratingCount: 87,
      image: '/products/kanken.png',
    },
    {
      name: 'Haglöfs L.I.M Down Jacket',
      description:
        'Ultralight 800-fill responsibly-sourced down jacket. Packs into its own pocket. Pre-loved, like-new with no down leakage.',
      price: 175.0,
      categoryId: insulation.id,
      brand: 'Haglöfs',
      weightGrams: 280,
      dims: [250, 200, 110],
      attributes: [
        { name: 'condition', value: 'Like New' },
        { name: 'size', value: 'L' },
        { name: 'gender', value: 'Mens' },
        { name: 'colour', value: 'Navy / Aqua' },
        { name: 'material', value: 'Recycled Down 800fp' },
        { name: 'authenticity', value: 'Verified' },
      ],
      rating: 4.9,
      ratingCount: 33,
      image: '/products/lim-down.png',
    },
    {
      name: 'Haglöfs ROC Spirit Fleece',
      description:
        'Technical grid-fleece midlayer with thumb loops. Pre-loved, very good condition with light pilling under the arms.',
      price: 79.0,
      categoryId: fleece.id,
      brand: 'Haglöfs',
      weightGrams: 360,
      dims: [300, 250, 70],
      attributes: [
        { name: 'condition', value: 'Very Good' },
        { name: 'size', value: 'S' },
        { name: 'gender', value: 'Womens' },
        { name: 'colour', value: 'Black' },
        { name: 'material', value: 'Polartec Power Grid' },
        { name: 'authenticity', value: 'Verified' },
      ],
      rating: 4.5,
      ratingCount: 58,
      image: '/products/roc-fleece.png',
    },
    {
      name: 'Luhta Insulated Parka',
      description:
        'Finnish-designed insulated winter parka with faux-fur hood trim. Pre-loved, good condition; warm and ready for another Nordic winter.',
      price: 129.0,
      categoryId: insulation.id,
      brand: 'Luhta',
      weightGrams: 1180,
      dims: [400, 320, 150],
      attributes: [
        { name: 'condition', value: 'Good' },
        { name: 'size', value: 'XL' },
        { name: 'gender', value: 'Mens' },
        { name: 'colour', value: 'Black' },
        { name: 'material', value: 'Polyamide / PrimaLoft' },
        { name: 'authenticity', value: 'Verified' },
      ],
      rating: 4.3,
      ratingCount: 22,
      image: '/products/luhta-parka.png',
    },
    {
      name: 'Sasta Kaarna Trekking Trousers',
      description:
        'Rugged Finnish-made trekking trousers in tough polycotton. Pre-loved, very good condition with reinforced knees intact.',
      price: 98.0,
      categoryId: trousers.id,
      brand: 'Sasta',
      weightGrams: 540,
      dims: [330, 260, 60],
      attributes: [
        { name: 'condition', value: 'Very Good' },
        { name: 'size', value: 'EU 50' },
        { name: 'gender', value: 'Mens' },
        { name: 'colour', value: 'Dark Olive' },
        { name: 'material', value: 'Polycotton' },
        { name: 'authenticity', value: 'Verified' },
      ],
      rating: 4.7,
      ratingCount: 19,
      image: '/products/sasta-kaarna.png',
    },
    {
      name: 'Peak Performance Helium Shell Jacket',
      description:
        '2.5-layer packable rain shell. Pre-loved, like-new; DWR re-proofed before listing. Authenticated against serial.',
      price: 159.0,
      categoryId: shellJackets.id,
      brand: 'Peak Performance',
      weightGrams: 300,
      dims: [260, 210, 70],
      attributes: [
        { name: 'condition', value: 'Like New' },
        { name: 'size', value: 'M' },
        { name: 'gender', value: 'Womens' },
        { name: 'colour', value: 'Light Grey' },
        { name: 'material', value: 'Recycled Nylon' },
        { name: 'authenticity', value: 'Verified' },
      ],
      rating: 4.6,
      ratingCount: 27,
      image: '/products/helium-shell.png',
    },
    {
      name: 'Norrøna Falketind Flex1 Trousers',
      description:
        'Stretchy softshell mountaineering trousers. Pre-loved, very good condition; great freedom of movement for scrambling and ski touring.',
      price: 145.0,
      categoryId: trousers.id,
      brand: 'Norrøna',
      weightGrams: 430,
      dims: [320, 250, 55],
      attributes: [
        { name: 'condition', value: 'Very Good' },
        { name: 'size', value: 'L' },
        { name: 'gender', value: 'Unisex' },
        { name: 'colour', value: 'Slate Teal' },
        { name: 'material', value: 'Softshell Stretch' },
        { name: 'authenticity', value: 'Verified' },
      ],
      rating: 4.8,
      ratingCount: 36,
      image: '/products/falketind.png',
    },
    {
      name: 'Klättermusen Allgrön 2.0 Jacket',
      description:
        'Premium recycled hardshell with Cutan membrane. Pre-loved, excellent condition; an investment piece built to be repaired, not replaced.',
      price: 339.0,
      categoryId: shellJackets.id,
      brand: 'Klättermusen',
      weightGrams: 560,
      dims: [350, 290, 95],
      attributes: [
        { name: 'condition', value: 'Excellent' },
        { name: 'size', value: 'M' },
        { name: 'gender', value: 'Mens' },
        { name: 'colour', value: 'Raven' },
        { name: 'material', value: 'Recycled Polyamide / Cutan' },
        { name: 'authenticity', value: 'Verified' },
      ],
      rating: 4.9,
      ratingCount: 14,
      image: '/products/allgron.png',
    },
    {
      name: 'Halti Fort DrymaxX Shell Jacket',
      description:
        'Finnish all-weather shell with DrymaxX membrane. Pre-loved, good condition; dependable for commuting and trail days alike.',
      price: 89.0,
      categoryId: shellJackets.id,
      brand: 'Halti',
      weightGrams: 480,
      dims: [330, 270, 85],
      attributes: [
        { name: 'condition', value: 'Good' },
        { name: 'size', value: 'S' },
        { name: 'gender', value: 'Womens' },
        { name: 'colour', value: 'Turquoise / Black' },
        { name: 'material', value: 'DrymaxX Polyester' },
        { name: 'authenticity', value: 'Verified' },
      ],
      rating: 4.4,
      ratingCount: 31,
      image: '/products/halti-fort.png',
    },
  ];

  const createdProducts: { id: string; rating: number }[] = [];

  for (const p of products) {
    const slug = slugify(p.name);
    const product = await prisma.product.upsert({
      where: { slug },
      update: {
        price: new Prisma.Decimal(p.price),
        averageRating: p.rating,
        ratingCount: p.ratingCount,
      },
      create: {
        name: p.name,
        slug,
        description: p.description,
        price: new Prisma.Decimal(p.price),
        currency: 'EUR',
        // Pre-loved items are one-of-a-kind.
        stockQuantity: 1,
        categoryId: p.categoryId,
        brandId: brands[p.brand].id,
        weightGrams: p.weightGrams,
        lengthMm: p.dims[0],
        widthMm: p.dims[1],
        heightMm: p.dims[2],
        averageRating: p.rating,
        ratingCount: p.ratingCount,
        images: { create: [{ url: p.image, altText: p.name, isPrimary: true, position: 0 }] },
        attributes: { create: p.attributes },
      },
    });

    // Keep images in sync on re-seed (upsert.update can't replace relations).
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.create({
      data: { productId: product.id, url: p.image, altText: p.name, isPrimary: true, position: 0 },
    });

    createdProducts.push({ id: product.id, rating: p.rating });
  }

  // --- Reviews (real rows so ratings are computed, not hard-coded) ---
  // A small panel of demo reviewers; product rating aggregates are derived from
  // these via ReviewsService.recomputeAggregates-equivalent logic below.
  const reviewerSeed = [
    { email: 'mikko@villi.test', firstName: 'Mikko', lastName: 'Korhonen' },
    { email: 'sofia@villi.test', firstName: 'Sofia', lastName: 'Lindqvist' },
    { email: 'erik@villi.test', firstName: 'Erik', lastName: 'Nilsen' },
    { email: 'liisa@villi.test', firstName: 'Liisa', lastName: 'Mäkinen' },
    { email: 'anders@villi.test', firstName: 'Anders', lastName: 'Berg' },
  ];
  const reviewerPassword = await argon2.hash('Reviewer!Passw0rd');
  const reviewers = [] as { id: string }[];
  for (const r of reviewerSeed) {
    reviewers.push(
      await prisma.user.upsert({
        where: { email: r.email },
        update: {},
        create: { ...r, passwordHash: reviewerPassword, isEmailVerified: true },
      }),
    );
  }

  const comments = [
    { title: 'Exactly as described', body: 'Condition matched the listing perfectly. Authentication gave me real confidence buying pre-loved.' },
    { title: 'Great find', body: 'Barely any wear and so much warmth for the weight. Would buy pre-loved here again.' },
    { title: 'Solid quality', body: 'Classic Nordic build. A couple of tiny marks as noted, otherwise excellent.' },
    { title: 'Very happy', body: 'Fast handling and the gear is genuinely as good as new. Highly recommend.' },
    { title: 'Good but runs snug', body: 'Quality is top-notch; sizing is a touch slim, factor that in when ordering.' },
  ];

  for (const cp of createdProducts) {
    // Idempotent re-seed: clear and regenerate this product's reviews.
    await prisma.review.deleteMany({ where: { productId: cp.id } });

    const target = Math.round(cp.rating); // 1..5
    const count = 3 + (Math.round(cp.rating * 10) % 3); // 3–5 reviews
    for (let i = 0; i < count && i < reviewers.length; i++) {
      // Spread ratings around the target so the average stays believable.
      const offset = i === 0 ? 0 : i % 2 === 0 ? 0 : -1;
      const rating = Math.min(5, Math.max(3, target + offset));
      const c = comments[i % comments.length];
      await prisma.review.create({
        data: { productId: cp.id, userId: reviewers[i].id, rating, title: c.title, body: c.body },
      });
    }

    const agg = await prisma.review.aggregate({
      where: { productId: cp.id },
      _avg: { rating: true },
      _count: true,
    });
    await prisma.product.update({
      where: { id: cp.id },
      data: {
        averageRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        ratingCount: agg._count,
      },
    });
  }

  console.log(
    `Seeded: admin=${admin.email}, customer=${customer.email}, products=${products.length}, reviewers=${reviewers.length}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
