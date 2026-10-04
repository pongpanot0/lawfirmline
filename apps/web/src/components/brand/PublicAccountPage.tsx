import Link from 'next/link';
import { SamnuanLogo } from './SamnuanLogo';

export function PublicAccountPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#142e43]">
      <header className="border-b border-[#142e43]/10">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-5" aria-label="Samnuan">
          <Link href="/" aria-label="Samnuan หน้าหลัก"><SamnuanLogo variant="horizontal" markClassName="h-9 w-9" wordmarkClassName="text-lg" /></Link>
          <Link href="/login" className="text-sm underline underline-offset-4">เข้าสู่ระบบ</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">{children}</main>
      <footer className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-3 border-t border-[#142e43]/10 px-5 py-6 text-sm">
        <Link href="/privacy" className="underline underline-offset-4">นโยบายความเป็นส่วนตัว</Link>
        <Link href="/delete-account" className="underline underline-offset-4">ขอลบบัญชี Samnuan</Link>
        <a href="mailto:hello@samnuan.co" className="underline underline-offset-4">ติดต่อทีมดูแล</a>
      </footer>
    </div>
  );
}
