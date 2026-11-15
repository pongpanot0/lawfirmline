import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { articleDate, getArticle, getArticles, parseInline, type Block } from '@/lib/marketing/articles';
import { serializeJsonLd, siteUrl } from '@/lib/seo';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { CtaBand } from '@/components/marketing/CtaBand';
import { Reveal } from '@/components/marketing/Reveal';
import '@/components/marketing/marketing.css';

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return getArticles().map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = getArticle((await params).slug);
  if (!article) return {};
  const title = `${article.title} | Samnuan`,
    description = article.meta_description,
    url = `/articles/${article.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Samnuan',
      locale: 'th_TH',
      type: 'article',
      images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
  };
}
function InlineText({ text }: { text: string }) {
  return parseInline(text).map((part, index) =>
    part.type === 'bold' ? (
      <strong key={index}>{part.text}</strong>
    ) : part.type === 'link' ? (
      <a key={index} href={part.href}>
        {part.text}
      </a>
    ) : (
      part.text
    ),
  );
}
function ArticleBlock({ block }: { block: Block }) {
  switch (block.type) {
    case 'h2':
      return (
        <h2 id={block.id}>
          <InlineText text={block.text} />
        </h2>
      );
    case 'h3':
      return (
        <h3 id={block.id}>
          <InlineText text={block.text} />
        </h3>
      );
    case 'paragraph':
      return (
        <p>
          <InlineText text={block.text} />
        </p>
      );
    case 'ul':
      return (
        <ul>
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol>
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineText text={item} />
            </li>
          ))}
        </ol>
      );
    case 'faq':
      return (
        <details>
          <summary>{block.question}</summary>
          <p>
            <InlineText text={block.answer} />
          </p>
        </details>
      );
    case 'table':
      return (
        <div className="mk-table-scroll" role="region" aria-label="ตารางเปรียบเทียบ" tabIndex={0}>
          <table>
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th scope="col" key={i}>
                    <InlineText text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
export default async function ArticlePage({ params }: Props) {
  const article = getArticle((await params).slug);
  if (!article) notFound();
  const url = `${siteUrl}/articles/${article.slug}`;
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: article.title,
        description: article.meta_description,
        inLanguage: 'th',
        datePublished: article.reviewed,
        dateModified: article.reviewed,
        author: { '@type': 'Organization', name: 'Samnuan' },
        publisher: {
          '@type': 'Organization',
          name: 'Samnuan',
          logo: { '@type': 'ImageObject', url: `${siteUrl}/brand/samnuan-logo.png` },
        },
        mainEntityOfPage: url,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'หน้าแรก', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'บทความ', item: `${siteUrl}/articles` },
          { '@type': 'ListItem', position: 3, name: article.title, item: url },
        ],
      },
    ],
  };
  const headings = article.blocks.filter((block) => block.type === 'h2');
  const others = getArticles().filter(({ slug }) => slug !== article.slug);
  return (
    <div className="mk font-sans antialiased">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structured) }} />
      <MarketingNav active="articles" />
      <main>
        <div className="mx-auto max-w-[1240px] px-4 md:px-6">
          <nav aria-label="breadcrumb" className="pt-6 text-sm leading-relaxed text-mk-ink-2">
            <a href="/" className="whitespace-nowrap hover:text-mk-ink">
              หน้าแรก
            </a>{' '}
            /{' '}
            <a href="/articles" className="whitespace-nowrap hover:text-mk-ink">
              บทความ
            </a>{' '}
            / <span>{article.title}</span>
          </nav>
          <div className="grid gap-12 pt-10 lg:grid-cols-[minmax(0,720px)_minmax(0,1fr)] lg:gap-20">
            <article className="min-w-0">
              <header>
                <h1 className="font-display text-3xl font-semibold leading-[1.3] md:text-5xl">{article.title}</h1>
                <p className="mt-5 text-lg leading-relaxed text-mk-ink-2">{article.meta_description}</p>
                <p className="mt-6 border-b border-mk-rule pb-6 text-sm leading-relaxed text-mk-ink-2">
                  ทีม Samnuan · ตรวจทานล่าสุด {articleDate(article.reviewed)} · อ่าน {article.minutes} นาที
                </p>
              </header>
              <div className="mk-prose">
                {article.blocks.map((block, i) => (
                  <ArticleBlock key={i} block={block} />
                ))}
              </div>
              <p className="mt-12 rounded-lg border border-mk-rule bg-mk-surface p-5 text-sm leading-relaxed text-mk-ink-2">
                บทความนี้เป็นข้อมูลทั่วไป ไม่ใช่คำแนะนำทางกฎหมาย
              </p>
            </article>
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <h2 className="font-display text-lg font-semibold">เนื้อหาในบทความ</h2>
                <nav aria-label="สารบัญบทความ">
                  <ul className="mt-4 space-y-3 text-sm leading-relaxed text-mk-ink-2">
                    {headings.map((heading) => (
                      <li key={heading.id}>
                        <a className="hover:text-mk-ink hover:underline" href={`#${heading.id}`}>
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
                <div className="mt-8 rounded-lg border border-mk-rule bg-mk-surface p-5">
                  <p className="font-display text-lg font-semibold">ทดลองใช้ Samnuan ฟรี 30 วัน</p>
                  <a
                    className="btn-primary mt-4 inline-block whitespace-nowrap rounded-lg bg-mk-ink px-4 py-3 text-sm font-medium text-mk-paper"
                    href="/register"
                  >
                    ทดลองใช้ฟรี
                  </a>
                </div>
              </div>
            </aside>
          </div>
          {others.length > 0 && (
            <Reveal>
              <section className="mt-20 max-w-[720px] border-t border-mk-rule pt-8">
                <h2 className="font-display text-2xl font-semibold">บทความอื่น</h2>
                {others.map((other) => (
                  <article key={other.slug} className="border-b border-mk-rule py-6">
                    <h3 className="font-display text-xl font-semibold">
                      <a className="hover:underline" href={`/articles/${other.slug}`}>
                        {other.title}
                      </a>
                    </h3>
                    <p className="mt-2 text-mk-ink-2">{other.meta_description}</p>
                  </article>
                ))}
              </section>
            </Reveal>
          )}
        </div>
        <CtaBand title="เริ่มใช้ Samnuan ฟรี 30 วัน" />
      </main>
      <MarketingFooter />
    </div>
  );
}
