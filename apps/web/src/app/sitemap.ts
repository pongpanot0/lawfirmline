import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';
import { stages } from '@/lib/marketing/features';
import { sitemapPair } from '@/lib/marketing/sitemap-pairs';
import { getArticles } from '@/lib/marketing/articles';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    ...sitemapPair(siteUrl, '/', lastModified, 1),
    { url: `${siteUrl}/register`, lastModified, priority: 0.8 },
    ...stages.flatMap(({ slug }) => sitemapPair(siteUrl, `/features/${slug}`, lastModified, 0.8)),
    ...sitemapPair(siteUrl, '/pricing', lastModified, 0.7),
    { url: `${siteUrl}/articles`, lastModified, priority: 0.6 },
    ...getArticles().map(({ slug, reviewed }) => ({
      url: `${siteUrl}/articles/${slug}`,
      lastModified: new Date(`${reviewed}T00:00:00Z`),
      priority: 0.6,
    })),
    { url: `${siteUrl}/privacy`, lastModified, priority: 0.3 },
  ];
}
