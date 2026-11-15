import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { classifySeoHost, privatePaths, siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = classifySeoHost((await headers()).get('host'));
  if (host === 'other') return { rules: { userAgent: '*', disallow: '/' } };
  if (host === 'development') return { rules: { userAgent: '*', allow: '/' } };

  return {
    rules: { userAgent: '*', allow: '/', disallow: privatePaths },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
