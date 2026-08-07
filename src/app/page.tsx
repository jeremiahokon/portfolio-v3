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
import { StickyCta } from '@/components/sticky-cta';

import { getShortsData } from '@/lib/youtube';

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
            // Google Search Console flags VideoObjects without a description;
            // Shorts often have empty ones, so fall back to the title.
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
      {/* The hero is pinned (sticky, z-0); everything below lives in this
          opaque z-10 sheet that slides up over it — the "sheet overlap". */}
      <Hero />
      <div className="bg-background relative z-10 rounded-t-sm shadow-[0_-28px_70px_rgba(0,0,0,0.45)] md:rounded-t-sm">
        <RecentWorks />
        <Manifesto />
        <Skills />
        <Stats />
        <Testimonials />
        <Tools />
        <YouTubeVideo />
        <ContentCreation videos={shortsData} />
        <Contact />
      </div>
      <StickyCta />
    </div>
  );
}
