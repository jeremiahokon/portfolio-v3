import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/constant';

// Real per-route dates, not build time: `new Date()` would restamp every
// route as "changed today" on every deploy. Bump only when content actually changes.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date('2026-08-15'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/tools`,
      lastModified: new Date('2026-08-07'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/extract-audio`,
      lastModified: new Date('2026-08-24'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/video-to-subtitles`,
      lastModified: new Date('2026-08-24'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];
}
