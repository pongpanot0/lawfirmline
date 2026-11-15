import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';
import { stages } from '@/lib/marketing/features';
import { getArticles } from '@/lib/marketing/articles';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${siteUrl}/`, lastModified, priority: 1 },
    { url: `${siteUrl}/register`, lastModified, priority: 0.8 },
    ...stages.map(({ slug }) => ({ url: `${siteUrl}/features/${slug}`, lastModified, priority: 0.8 })),
    { url: `${siteUrl}/pricing`, lastModified, priority: 0.7 },
    { url: `${siteUrl}/articles`, lastModified, priority: 0.6 },
    ...getArticles().map(({ slug, reviewed }) => ({ url: `${siteUrl}/articles/${slug}`, lastModified: new Date(`${reviewed}T00:00:00Z`), priority: 0.6 })),
    { url: `${siteUrl}/privacy`, lastModified, priority: 0.3 },
  ];
}
