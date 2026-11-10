/** Manual only: cd apps/api && npx ts-node scripts/convert-open-intakes.ts [--dry-run] */
import 'reflect-metadata';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { IntakeService } from '../src/intake/intake.service';
import { PrismaService } from '../src/prisma/prisma.module';

export async function convertOpenIntakes(
  prisma: Pick<PrismaService, 'firm' | 'firmMember'>,
  intake: Pick<IntakeService, 'countUnlinked' | 'convertUnlinked'>,
  dryRun: boolean,
) {
  const firms = await prisma.firm.findMany({ select: { id: true, slug: true }, orderBy: { id: 'asc' } });
  let failed = 0;
  for (const firm of firms) {
    const owner = await prisma.firmMember.findFirst({
      where: { firmId: firm.id, role: FirmRole.OWNER }, orderBy: { createdAt: 'asc' }, select: { userId: true },
    });
    const user = { id: owner?.userId ?? '', firmId: firm.id, firmRole: FirmRole.OWNER } as AuthUser;
    const { count } = await intake.countUnlinked(user);
    if (dryRun) {
      console.log(`${firm.slug}: would convert ${count} open intakes`);
      continue;
    }
    if (!owner) {
      console.error(`${firm.slug}: skipped ${count} open intakes (no owner)`);
      failed++;
      continue;
    }
    const result = await intake.convertUnlinked(user);
    failed += result.failed;
    console.log(`${firm.slug}: eligible=${count} converted=${result.converted} failed=${result.failed} remaining=${result.remaining}`);
  }
  return failed;
}

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== '--dry-run')) throw new Error('Usage: convert-open-intakes.ts [--dry-run]');
  // Compile only: no init/listen, so lifecycle hooks and scheduled jobs never start.
  const app = await Test.createTestingModule({ imports: [AppModule] }).compile();
  try {
    process.exitCode = await convertOpenIntakes(app.get(PrismaService), app.get(IntakeService), process.argv.includes('--dry-run')) ? 1 : 0;
  } finally {
    await app.get(PrismaService).$disconnect();
    await app.close();
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
