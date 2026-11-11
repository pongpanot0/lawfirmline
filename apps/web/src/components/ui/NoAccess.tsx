import Link from 'next/link';
import { Lock } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

/**
 * Shown instead of a page the signed-in role cannot use. A retry button would never succeed here,
 * so this says who the page is for and gives one way back.
 */
export function NoAccess({ who = 'เจ้าของและผู้จัดการสำนักงาน', contact = 'เจ้าของหรือผู้จัดการสำนักงาน' }: { who?: string; contact?: string | null }) {
  return (
    <div role="alert" className="rounded-xl border bg-card p-6 shadow-sm">
      <p className="flex items-center gap-2 font-semibold text-foreground"><Lock className="h-4 w-4 shrink-0" aria-hidden />หน้านี้สำหรับ{who}</p>
      <p className="mt-1 text-sm text-muted-foreground">บัญชีของคุณไม่มีสิทธิ์เปิดหน้านี้{contact ? ` ถ้าต้องใช้ ติดต่อ${contact}` : ''}</p>
      <Link href="/dashboard" className={buttonVariants({ variant: 'outline', className: 'mt-4' })}>กลับไปหน้าแรก</Link>
    </div>
  );
}
