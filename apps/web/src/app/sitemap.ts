import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';
import { stages } from '@/lib/marketing/features';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${siteUrl}/`, lastModified, priority: 1 },
    { url: `${siteUrl}/register`, lastModified, priority: 0.8 },
    ...stages.map(({ slug }) => ({ url: `${siteUrl}/features/${slug}`, lastModified, priority: 0.8 })),
    { url: `${siteUrl}/privacy`, lastModified, priority: 0.3 },
  ];
}
