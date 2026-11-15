import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pages, stages } from '@/lib/marketing/features';
import { alternates } from '@/lib/marketing/i18n';
import { FeaturePageView } from '@/components/marketing/FeaturePageView';

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return stages.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const stage = stages.find((s) => s.slug === slug);
  if (!stage) return {};
  const page = pages[stage.key];
  const title = `${page.h1.replace(/\|/g, ' ')} | Samnuan`;
  const description = page.lead;
  return {
    title,
    description,
    alternates: alternates(`/features/${slug}`),
    // Child openGraph/twitter replace the root layout's objects wholesale, so repeat the shared fields.
    openGraph: {
      title,
      description,
      url: `/features/${slug}`,
      siteName: 'Samnuan',
      locale: 'th_TH',
      type: 'website',
      images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
  };
}
export default async function FeaturePage({ params }: Props) {
  const { slug } = await params;
  if (!stages.some((stage) => stage.slug === slug)) notFound();
  return <FeaturePageView lang="th" slug={slug} />;
}
