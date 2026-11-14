import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthUser } from '@lawfirm/shared';
import type { PlanQuotaService } from './services/plan-quota.service';

/** Carries document costs through nested OCR calls without passing HTTP requests into services. */
export const aiCreditContext = new AsyncLocalStorage<{
  user: AuthUser;
  quota: PlanQuotaService;
  files: Map<Buffer, number>;
}>();

export function requestAiCredits(): number {
  const files = aiCreditContext.getStore()?.files;
  return files?.size ? [...files.values()].reduce((sum, credits) => sum + credits, 0) : 1;
}

export async function assertFileCredits(files: Array<[Buffer, number]>): Promise<void> {
  const context = aiCreditContext.getStore();
  if (!context) return;
  for (const [buffer, credits] of files) context.files.set(buffer, credits);
  await context.quota.assertAiAvailable(context.user, requestAiCredits());
}
