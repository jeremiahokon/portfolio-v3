import type { Metadata } from 'next';

import Contact from '@/components/sections/contact';
import ContentCreation from '@/components/sections/content-creation';
import Hero from '@/components/sections/hero';
import Manifesto from '@/components/sections/manifesto';
import RecentWorks from '@/components/sections/recent-works';
import Skills from '@/components/sections/skills';
import Stats from '@/components/sections/stats';
import Testimonials from '@/components/sections/testimonials';
import Tools from '@/components/sections/tools';
import YouTubeVideo from '@/components/sections/youtube-video';

import { SITE_URL } from '@/lib/constant';
import { getShortsData } from '@/lib/youtube';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// No `title` here on purpose: the layout's `template` would double the
// "| Jeremiah Okon" suffix onto the already-complete default title.
export const metadata: Metadata = {
  description:
    "Full-stack product engineer's portfolio, available for remote hire by teams in the UK, Ireland & Netherlands: production web platforms, free browser tools.",
  alternates: { canonical: '/' },
  openGraph: {
    title:
      'Jeremiah Okon - Full-Stack Product Engineer | React, Next.js & Node.js',
    description:
      "Full-stack product engineer's portfolio, available for remote hire by teams in the UK, Ireland & Netherlands: production web platforms, free browser tools.",
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title:
      'Jeremiah Okon - Full-Stack Product Engineer | React, Next.js & Node.js',
    description:
      "Full-stack product engineer's portfolio, available for remote hire by teams in the UK, Ireland & Netherlands: production web platforms, free browser tools.",
  },
};

export default async function Home() {
  const shortsData = await getShortsData();

  const videoSchema =
    shortsData && shortsData.some((video) => video.viewCount !== null)
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          itemListElement: shortsData.map((video, index) => ({
            '@type': 'VideoObject',
            position: index + 1,
            name: video.title,
            // GSC flags VideoObjects without a description; Shorts often lack one.
            description: (video.description ?? video.title).slice(0, 300),
            thumbnailUrl:
              video.thumbnailUrl ??
              `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
            uploadDate: video.publishedAt,
            embedUrl: `https://www.youtube-nocookie.com/embed/${video.id}`,
            contentUrl: `https://www.youtube.com/shorts/${video.id}`,
          })),
        }
      : null;

  return (
    <div className="relative w-full">
      {videoSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(videoSchema) }}
        />
      )}
      {/* Hero is pinned (z-0); this opaque z-10 sheet slides up over it. */}
      <Hero />
      <div className="bg-background relative z-10 rounded-t-sm shadow-[0_-28px_70px_rgba(0,0,0,0.45)] md:rounded-t-sm">
        <RecentWorks />
        {/* Right after proof of work, since the tools are free/no-signup and the cheapest way to get someone to interact. */}
        <Tools />
        <Manifesto />
        <Skills />
        <Stats />
        <Testimonials />
        <YouTubeVideo />
        <ContentCreation videos={shortsData} />
        <Contact />
      </div>
    </div>
  );
}
