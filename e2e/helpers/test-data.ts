import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../apps/api/src/generated/prisma';

// Fixture provisioning/cleanup is deliberately restricted to a local database.
// No email is sent: invitation tokens are seeded for the browser acceptance flow.
export function localTestData() {
  const requireApi = createRequire(path.resolve('apps/api/package.json'));
  requireApi('dotenv').config({ path: path.resolve('apps/api/.env'), quiet: true });
  const dbHost = new URL(process.env.DATABASE_URL!).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(dbHost)) throw new Error('E2E fixtures require a local database');
  const db = new PrismaClient();
  const tag = `e2e-${randomUUID().slice(0, 8)}`;
  return {
    db, tag,
    email: `${tag}@example.test`,
    firmName: `E2E ${tag}`,
    password: 'E2e-only-password-2026',
    async cleanup() {
      try {
        const users = await db.user.findMany({ where: { email: { startsWith: tag, endsWith: '@example.test' } }, select: { id: true } });
        const firms = await db.firm.findMany({ where: { name: { startsWith: `E2E ${tag}` } }, select: { id: true } });
        await db.$transaction(async tx => {
          await tx.task.deleteMany({ where: { createdById: { in: users.map(u => u.id) } } });
          await tx.expense.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
          // ON DELETE RESTRICT from AppliedPlaybook to PlaybookRelease: clear applications
          // before the firm cascade tries to remove their release.
          await tx.appliedPlaybook.deleteMany({ where: { release: { firmId: { in: firms.map(f => f.id) } } } });
          await tx.firm.deleteMany({ where: { id: { in: firms.map(f => f.id) } } });
          await tx.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
        });
      } finally { await db.$disconnect(); }
    },
  };
}
