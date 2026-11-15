import type { Lang } from '@/lib/marketing/i18n';
import { Reveal } from './Reveal';

const copy = {
  th: {
    s0: 'ทดลองใช้ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต',
    s1: 'ทดลองใช้ฟรี 30 วัน',
  },
  en: {
    s0: 'Free for 30 days. No credit card required.',
    s1: 'Start 30-day free trial',
  },
};
export function CtaBand({ title, lang = 'th' }: { title: string; lang?: Lang }) {
  const c = copy[lang];
  return (
    <Reveal>
      <section className="mx-auto my-20 max-w-[1240px] px-4 md:px-6">
        <div className="rounded-2xl bg-mk-ink px-6 py-14 text-center md:py-16">
          <h2 className="font-display text-3xl font-semibold text-mk-paper md:text-4xl">{title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-mk-cta-muted">{c.s0}</p>
          <a
            href="/register"
            className="btn-primary mt-8 inline-block whitespace-nowrap rounded-lg bg-mk-paper px-8 py-3.5 font-semibold text-mk-ink"
          >
            {c.s1}
          </a>
        </div>
      </section>
    </Reveal>
  );
}
