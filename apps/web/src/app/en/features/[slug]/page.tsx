import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPage, getStages } from '@/lib/marketing/features';
import { alternates } from '@/lib/marketing/i18n';
import { FeaturePageView } from '@/components/marketing/FeaturePageView';

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return getStages('en').map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const stage = getStages('en').find((s) => s.slug === slug);
  if (!stage) return {};
  const page = getPage('en', stage.key);
  const title = `${page.h1.replace(/\|/g, ' ')} | Samnuan`;
  const description = page.lead;
  const url = `/en/features/${slug}`;
  return {
    title,
    description,
    alternates: alternates(url),
    openGraph: {
      title,
      description,
      url,
      siteName: 'Samnuan',
      locale: 'en_US',
      type: 'website',
      images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
  };
}
export default async function EnglishFeaturePage({ params }: Props) {
  const { slug } = await params;
  if (!getStages('en').some((stage) => stage.slug === slug)) notFound();
  return <FeaturePageView lang="en" slug={slug} />;
}
