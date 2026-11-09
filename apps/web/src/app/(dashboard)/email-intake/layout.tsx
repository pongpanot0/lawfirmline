'use client';
import { usePathname } from 'next/navigation';
import { EmailIntakeList } from '@/components/email-intake/EmailIntakeList';
export default function EmailIntakeLayout({ children }: { children: React.ReactNode }) {
  const selected = usePathname() !== '/email-intake';
  return <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
    <aside className={`${selected ? 'hidden lg:block' : ''} min-w-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto`}><EmailIntakeList /></aside>
    <main className={`${selected ? '' : 'hidden lg:block'} min-w-0`}>{children}</main>
  </div>;
}
