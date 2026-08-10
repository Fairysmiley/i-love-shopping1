import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Creates (or resets the stock of) two synthetic products used only by k6
 * load-test scenarios. Every real catalog item is seeded with
 * stockQuantity: 1 (one-of-a-kind pre-loved items) by design, which isn't
 * useful for load testing:
 *
 * - The checkout scenario needs a DELIBERATELY BOUNDED stock level so we can
 *   report a meaningful "requested vs. fulfilled vs. correctly rejected"
 *   breakdown and confirm concurrent checkouts never oversell it.
 * - The cart scenario needs AMPLE stock — it runs continuously for the
 *   whole test and must never legitimately run out, or "add to cart"
 *   failures become indistinguishable from a real bug.
 * These must be different products: sharing one fixture made the checkout
 * scenario's real (and correct!) exhaustion of bounded stock look like a
 * cart-scenario failure once it ran out.
 */
async function main(): Promise<void> {
  const category = await prisma.category.findFirst();
  const brand = await prisma.brand.findFirst();
  if (!category || !brand) {
    throw new Error('Run `npm run prisma:seed` first — no category/brand to attach the fixture to.');
  }

  const checkoutStock = parseInt(process.env.LOAD_TEST_CHECKOUT_STOCK ?? '25', 10);
  const checkoutProduct = await prisma.product.upsert({
    where: { slug: 'load-test-fixture-item' },
    update: { stockQuantity: checkoutStock },
    create: {
      name: '[Load Test Fixture] Do Not Purchase (Checkout)',
      slug: 'load-test-fixture-item',
      description: 'Synthetic product created for k6 load testing (checkout scenario). Not a real listing.',
      price: new Prisma.Decimal('1.00'),
      currency: 'EUR',
      stockQuantity: checkoutStock,
      categoryId: category.id,
      brandId: brand.id,
      images: { create: [{ url: '/products/keb-shell.png', altText: 'Load test fixture', isPrimary: true, position: 0 }] },
    },
  });
  console.log(`Checkout fixture ready: slug=${checkoutProduct.slug} stock=${checkoutStock}`);

  const cartStock = parseInt(process.env.LOAD_TEST_CART_STOCK ?? '100000', 10);
  const cartProduct = await prisma.product.upsert({
    where: { slug: 'load-test-cart-fixture-item' },
    update: { stockQuantity: cartStock },
    create: {
      name: '[Load Test Fixture] Do Not Purchase (Cart)',
      slug: 'load-test-cart-fixture-item',
      description: 'Synthetic product created for k6 load testing (cart scenario). Not a real listing.',
      price: new Prisma.Decimal('1.00'),
      currency: 'EUR',
      stockQuantity: cartStock,
      categoryId: category.id,
      brandId: brand.id,
      images: { create: [{ url: '/products/kanken.png', altText: 'Load test fixture', isPrimary: true, position: 0 }] },
    },
  });
  console.log(`Cart fixture ready: slug=${cartProduct.slug} stock=${cartStock}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
