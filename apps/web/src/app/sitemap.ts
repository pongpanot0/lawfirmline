import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${siteUrl}/`, lastModified, priority: 1 },
    { url: `${siteUrl}/register`, lastModified, priority: 0.8 },
    { url: `${siteUrl}/privacy`, lastModified, priority: 0.3 },
  ];
}
