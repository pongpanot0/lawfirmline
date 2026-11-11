import type { ReactNode } from 'react';

export function NextActionCard({ eyebrow, action, footer, tone = 'default' }: { eyebrow: string; action: ReactNode; footer?: ReactNode; tone?: 'default' | 'overdue' | 'ready' | 'info' }) {
  const colors = { default: 'border-[#e6cf94] bg-[#fbf3e0]' , overdue: 'border-[#e9b9b9] bg-[#fbeaea]', ready: 'border-[#a9d3bd] bg-[#e6f3ec]', info: 'border-[#e9b9b9] bg-[#fbeaea]' };
  return <section className={`min-w-0 rounded-xl border-2 p-5 shadow-[0_6px_20px_rgba(20,46,67,.08)] ${colors[tone]}`}><p className={`text-sm font-semibold ${tone === 'ready' ? 'text-[#227052]' : tone === 'overdue' || tone === 'info' ? 'text-[#a83232]' : 'text-[#6b4f0b]'}`}>{eyebrow}</p>{action}{footer && <div className="flex flex-wrap items-center mt-4 gap-x-4 gap-y-2 border-t border-[#ecd2d2] pt-4 text-sm">{footer}</div>}</section>;
}
