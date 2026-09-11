/**
 * One-off cleanup: removes e2e/OAuth test accounts left over from running
 * the test suite against this dev database directly (rather than the
 * isolated `docker compose --profile test` DB). Scoped to the exact pattern
 * `e2e_*@example.com` / `oauth_{github,google,link,facebook}_*@example.com`
 * — every one of these was confirmed to have zero Orders (no FK blockers),
 * so this is a clean delete, not a judgment call about real user data.
 *
 * Deliberately does NOT touch anything outside that pattern — e.g.
 * `e2e-shopper@test.com`, `edge-cases@test.com`, or any real personal
 * account — even if it looks like test data, since some of those have real
 * order history attached.
 *
 * The running `api` container is a lean runtime image without ts-node, so
 * run this via the build's `builder` stage instead (has full devDeps,
 * same source) attached to the compose network:
 *
 *   cd backend
 *   docker build --target builder -t villi-backend-builder .
 *   docker run --rm --network i-love-shopping_default \
 *     -e DATABASE_URL=postgresql://villi:villi_dev_password@postgres:5432/villi?schema=public \
 *     -e ENCRYPTION_KEY=<same value as your .env> \
 *     -v "$(pwd)/scripts:/app/scripts" \
 *     villi-backend-builder npx ts-node scripts/cleanup-e2e-users.ts
 */
import { PrismaClient } from '@prisma/client';
import { decrypt } from '../src/common/utils/encryption.util';

const prisma = new PrismaClient();

const JUNK_PREFIXES = [
  'e2e_',
  'oauth_github_',
  'oauth_google_',
  'oauth_link_',
  'oauth_facebook_',
];

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  const junkIds: string[] = [];
  for (const u of users) {
    const email = decrypt(u.email).toLowerCase();
    if (JUNK_PREFIXES.some((p) => email.startsWith(p)) && email.endsWith('@example.com')) {
      junkIds.push(u.id);
    }
  }

  console.log(`Found ${junkIds.length} matching junk accounts.`);
  if (junkIds.length === 0) return;

  // Guard: refuse to delete anyone who has a real Order (Order.userId is
  // onDelete: Restrict on purpose — this script must never silently destroy
  // order history).
  const withOrders = await prisma.order.findMany({
    where: { userId: { in: junkIds } },
    select: { userId: true },
    distinct: ['userId'],
  });
  if (withOrders.length > 0) {
    console.error(
      `Refusing to proceed: ${withOrders.length} of the matched accounts have Order rows. ` +
        `Investigate before deleting — this script only expects zero-dependency junk accounts.`,
    );
    process.exit(1);
  }

  const result = await prisma.user.deleteMany({ where: { id: { in: junkIds } } });
  console.log(`Deleted ${result.count} accounts.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
