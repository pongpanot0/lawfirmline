import type { Metadata } from 'next';
import { getArticles, articleDate } from '@/lib/marketing/articles';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { CtaBand } from '@/components/marketing/CtaBand';
import { Reveal } from '@/components/marketing/Reveal';
import '@/components/marketing/marketing.css';

const title = 'บทความสำหรับสำนักงานกฎหมาย | Samnuan';
const description = 'ความรู้และแนวทางสำหรับการบริหารสำนักงานกฎหมายไทย ตั้งแต่การจัดการคดีจนถึงการทำงานร่วมกันในทีม';
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/articles' },
  openGraph: {
    title,
    description,
    url: '/articles',
    siteName: 'Samnuan',
    locale: 'th_TH',
    type: 'website',
    images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
};
export default function ArticlesPage() {
  return (
    <div className="mk font-sans antialiased">
      <MarketingNav active="articles" path="/articles" />
      <main>
        <section className="mx-auto max-w-[1240px] px-4 pt-16 md:px-6 md:pt-20">
          <h1 className="max-w-3xl font-display text-3xl font-semibold leading-tight md:text-5xl">
            ความรู้สำหรับการบริหารสำนักงานกฎหมาย
          </h1>
          <p className="mt-5 text-lg text-mk-ink-2">แนวทางจัดการคดีและการทำงานในสำนักงานกฎหมายไทย</p>
          <div className="mt-12 grid gap-x-10 border-t border-mk-rule md:grid-cols-2">
            {getArticles().map((article) => (
              <Reveal key={article.slug}>
                <article className="border-b border-mk-rule py-8">
                  <h2 className="font-display text-2xl font-semibold leading-snug">
                    <a className="hover:underline" href={`/articles/${article.slug}`}>
                      {article.title}
                    </a>
                  </h2>
                  <p className="mt-4 leading-relaxed text-mk-ink-2">{article.meta_description}</p>
                  <p className="mt-5 text-sm text-mk-ink-2">
                    อ่าน {article.minutes} นาที · ตรวจทานล่าสุด {articleDate(article.reviewed)}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
        <CtaBand title="เริ่มใช้ Samnuan ฟรี 30 วัน" />
      </main>
      <MarketingFooter />
    </div>
  );
}
