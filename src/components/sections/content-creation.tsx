'use client';

import { useState } from 'react';
import Image from 'next/image';
import { sendGAEvent } from '@next/third-parties/google';

import { Play } from 'lucide-react';
import { m } from 'motion/react';

import { GA_EVENTS } from '@/lib/analytics-events';
import { TIKTOK_URL, YOUTUBE_CHANNEL_URL } from '@/lib/constant';
import { useReducedMotion } from '@/lib/hooks';
import shortsFallback from '@/lib/shorts-fallback.json';
import { formatCompact } from '@/lib/utils';
import type { ShortVideoData } from '@/lib/youtube';

const VIEW_COUNT_DISPLAY_THRESHOLD = 1000;

// Thumbnail fallback chain: oar2 (1080×1920 portrait, matches the 9:16 frame
// but 404s for some Shorts) → API-provided url → maxresdefault → hqdefault.
// The <Image onError> handler walks this chain on 404.
function thumbnailCandidates(video: ShortVideoData): string[] {
  const candidates = [
    `https://i.ytimg.com/vi/${video.id}/oar2.jpg`,
    `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
  ];
  if (video.thumbnailUrl && !candidates.includes(video.thumbnailUrl)) {
    candidates.splice(1, 0, video.thumbnailUrl);
  }

  return candidates;
}

function VideoCard({ video }: { video: ShortVideoData }) {
  const [active, setActive] = useState(false);
  const [thumbIndex, setThumbIndex] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  const thumbnails = thumbnailCandidates(video);
  const thumbnailSrc = thumbnails[Math.min(thumbIndex, thumbnails.length - 1)];

  return (
    <m.div
      className="flex w-full justify-center"
      variants={
        prefersReducedMotion
          ? undefined
          : {
              hidden: { opacity: 0, y: 30 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
              },
            }
      }
    >
      {/* Phone frame */}
      <div className="relative aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-sm border-[8px] border-[#2C3333] bg-[#2C3333] shadow-2xl transition-transform duration-300 hover:scale-[1.02]">
        {/* Notch */}
        <div className="absolute top-2.5 left-1/2 z-20 h-2 w-20 -translate-x-1/2 rounded-sm bg-white/20" />

        {active ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 h-full w-full rounded-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setActive(true);
              sendGAEvent({
                event: GA_EVENTS.SHORT_PLAYED_ON_CONTENT,
                value: video.id,
                video_id: video.id,
                video_title: video.title,
                event_category: 'engagement',
              });
            }}
            className="group absolute inset-0 h-full w-full overflow-hidden rounded-sm"
            aria-label={`Play ${video.title}`}
          >
            <Image
              src={thumbnailSrc}
              alt={video.title}
              fill
              sizes="(max-width: 640px) 92vw, 360px"
              onError={() => setThumbIndex((i) => i + 1)}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

            {/* View count — hidden below the threshold so early low
                numbers don't undercut credibility with potential clients */}
            {video.viewCount !== null &&
              video.viewCount >= VIEW_COUNT_DISPLAY_THRESHOLD && (
                <span className="font-family-inter absolute top-8 right-4 z-10 flex items-center gap-1.5 rounded-sm bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                  <Play className="h-3 w-3 fill-white text-white" />
                  {formatCompact(video.viewCount)} views
                </span>
              )}

            {/* Play button */}
            <span className="absolute top-1/2 left-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm bg-white/90 shadow-lg backdrop-blur transition-transform duration-300 group-hover:scale-110">
              <Play className="ml-1 h-8 w-8 fill-[#2C3333] text-[#2C3333]" />
            </span>

            {/* Title */}
            <span className="font-family-inter absolute right-4 bottom-4 left-4 text-left text-base font-medium text-white">
              {video.title}
            </span>
          </button>
        )}
      </div>
    </m.div>
  );
}

export default function ContentCreation({
  videos,
}: {
  videos: ShortVideoData[] | null;
}) {
  const prefersReducedMotion = useReducedMotion();

  const list: ShortVideoData[] = videos ?? shortsFallback.videos;

  return (
    <section
      id="content"
      className="relative flex w-full flex-col items-center gap-10 px-4 py-20 md:gap-14 md:px-10 md:py-32"
    >
      {/* Eyebrow + Heading */}
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="font-family-inter text-xs font-medium tracking-[0.3em] text-[#2C3333]/50 uppercase">
          [ ON THE SIDE ]
        </span>
        <h2 className="text-footer-background max-w-3xl text-3xl leading-tight font-bold tracking-tight md:text-5xl lg:text-6xl">
          I create{' '}
          <span className="font-family-instrument font-normal italic">
            content
          </span>{' '}
          off the clock, too.
        </h2>
        <p className="font-family-inter max-w-xl text-base text-[#2C3333]/70 md:text-lg">
          When I&apos;m not shipping code, I&apos;m sharing the journey — dev
          life, tips, and building in public on YouTube and TikTok.
        </p>
      </div>

      {/* Grid */}
      <m.div
        className="grid w-full max-w-6xl grid-cols-1 justify-items-center gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3"
        variants={
          prefersReducedMotion
            ? undefined
            : {
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.08, delayChildren: 0.1 },
                },
              }
        }
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.1 }}
      >
        {list.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </m.div>

      {/* Platform links */}
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <a
          href={YOUTUBE_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            sendGAEvent({
              event: GA_EVENTS.YOUTUBE_ON_CONTENT_SECTION,
              value: 'YouTube',
              social_url: YOUTUBE_CHANNEL_URL,
              event_category: 'engagement',
            });
          }}
          className="group flex items-center gap-2 rounded-sm border border-[#2C3333]/15 px-6 py-3 transition-colors duration-300 hover:border-[#7BB6DD]/50 hover:bg-[#2C3333]/[0.04]"
        >
          <span className="font-family-inter text-sm font-medium tracking-wide text-[#2C3333] uppercase">
            Subscribe on YouTube
          </span>
        </a>
        <a
          href={TIKTOK_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            sendGAEvent({
              event: GA_EVENTS.TIKTOK_ON_CONTENT_SECTION,
              value: 'TikTok',
              social_url: TIKTOK_URL,
              event_category: 'engagement',
            });
          }}
          className="group flex items-center gap-2 rounded-sm border border-[#2C3333]/15 px-6 py-3 transition-colors duration-300 hover:border-[#7BB6DD]/50 hover:bg-[#2C3333]/[0.04]"
        >
          <span className="font-family-inter text-sm font-medium tracking-wide text-[#2C3333] uppercase">
            Follow on TikTok
          </span>
        </a>
      </div>
    </section>
  );
}
