'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { sendGAEvent } from '@next/third-parties/google';

import type { LucideIcon } from 'lucide-react';
import { MessageSquareQuote, MonitorPlay, Play, Wrench } from 'lucide-react';
import { m } from 'motion/react';

import { GA_EVENTS } from '@/lib/analytics-events';
import { TIKTOK_URL, YOUTUBE_CHANNEL_URL } from '@/lib/constant';
import { useReducedMotion } from '@/lib/hooks';
import shortsFallback from '@/lib/shorts-fallback.json';
import { formatCompact } from '@/lib/utils';
import {
  groupByCategory,
  type ShortVideoData,
  type VideoCategory,
} from '@/lib/youtube';

// Carries the label's meaning once the word collapses to an icon on mobile.
const CATEGORY_ICONS: Record<VideoCategory, LucideIcon> = {
  products: MonitorPlay,
  tools: Wrench,
  opinions: MessageSquareQuote,
};

const VIEW_COUNT_DISPLAY_THRESHOLD = 1000;

// Fallback chain walked by <Image onError> on 404. API url must stay first:
// oar2.jpg is an auto-generated Shorts frame that almost always resolves, so
// putting it ahead of the real thumbnail would mask it entirely.
function thumbnailCandidates(video: ShortVideoData): string[] {
  const generated = [
    `https://i.ytimg.com/vi/${video.id}/oar2.jpg`,
    `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
  ];
  if (!video.thumbnailUrl) return generated;

  // Filter the generated list rather than early-returning on includes():
  // that bail-out would silently restore the oar2-first order this exists to prevent.
  return [
    video.thumbnailUrl,
    ...generated.filter((url) => url !== video.thumbnailUrl),
  ];
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
      <div className="relative aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-sm border-[8px] border-[#2C3333] bg-[#2C3333] shadow-2xl transition-transform duration-300 hover:scale-[1.02]">
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
              // Decorative: title is already visible text + aria-label; repeating
              // it in alt triggers axe's image-redundant-alt.
              alt=""
              fill
              sizes="(max-width: 640px) 92vw, 360px"
              onError={() => setThumbIndex((i) => i + 1)}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

            {/* Hidden below threshold: low early counts undercut credibility */}
            {video.viewCount !== null &&
              video.viewCount >= VIEW_COUNT_DISPLAY_THRESHOLD && (
                <span className="font-family-inter absolute top-8 right-4 z-10 flex items-center gap-1.5 rounded-sm bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                  <Play className="h-3 w-3 fill-white text-white" />
                  {formatCompact(video.viewCount)} views
                </span>
              )}

            <span className="absolute top-1/2 left-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm bg-white/90 shadow-lg backdrop-blur transition-transform duration-300 group-hover:scale-110">
              <Play className="ml-1 h-8 w-8 fill-[#2C3333] text-[#2C3333]" />
            </span>

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
  const groups = groupByCategory(list);
  const [activeId, setActiveId] = useState(groups[0]?.id);
  const active = groups.find((g) => g.id === activeId) ?? groups[0];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys move + activate per the WAI-ARIA tabs pattern; Tab-only would
  // surprise screen-reader users on a role="tab".
  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const delta =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + groups.length) % groups.length;
    setActiveId(groups[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section
      id="content"
      className="relative flex w-full flex-col items-center gap-10 px-4 py-20 md:gap-14 md:px-10 md:py-32"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="font-family-inter text-xs font-medium tracking-[0.3em] text-[#2C3333]/75 uppercase">
          [ IN THE OPEN ]
        </span>
        <h2 className="text-footer-background max-w-3xl text-3xl leading-tight font-bold tracking-tight md:text-5xl lg:text-6xl">
          I document how these{' '}
          <span className="font-family-instrument font-normal italic">
            systems
          </span>{' '}
          get built.
        </h2>
      </div>

      {/* Labels collapse to icon+count on mobile instead of wrapping: flex-wrap
          dropped "Opinions" onto its own line, reading as a layout bug. */}
      {groups.length > 1 && (
        <div className="flex flex-col items-center gap-4">
          <div
            role="tablist"
            aria-label="Video categories"
            className="flex items-center gap-1 rounded-sm border border-[#2C3333]/10 bg-white/60 p-1.5"
          >
            {groups.map((group, index) => {
              const isActive = group.id === active?.id;
              const Icon = CATEGORY_ICONS[group.id];

              return (
                <button
                  key={group.id}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  role="tab"
                  id={`videos-tab-${group.id}`}
                  aria-selected={isActive}
                  aria-controls={`videos-panel-${group.id}`}
                  // Label is hidden on mobile for unselected tabs; aria-label
                  // still contains those words so voice control can match them.
                  aria-label={`${group.label}, ${group.videos.length} ${
                    group.videos.length === 1 ? 'video' : 'videos'
                  }`}
                  // Roving tabindex: only the selected tab is a stop, so Tab skips past the tablist.
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveId(group.id)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                  className={`font-family-inter relative flex items-center gap-2 rounded-sm px-3.5 py-2.5 text-xs font-medium tracking-[0.12em] whitespace-nowrap uppercase transition-colors duration-300 md:px-5 md:text-sm ${
                    isActive
                      ? 'text-background'
                      : 'text-[#2C3333]/70 hover:text-[#2C3333]'
                  }`}
                >
                  {isActive &&
                    (prefersReducedMotion ? (
                      <span className="bg-footer-background absolute inset-0 rounded-sm" />
                    ) : (
                      <m.span
                        layoutId="video-tab-pill"
                        className="bg-footer-background absolute inset-0 rounded-sm"
                        transition={{
                          type: 'spring',
                          stiffness: 420,
                          damping: 36,
                        }}
                      />
                    ))}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon
                      className="h-4 w-4 shrink-0"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span className={isActive ? 'inline' : 'hidden sm:inline'}>
                      {group.label}
                    </span>
                    <span className="opacity-60">{group.videos.length}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {active && (
            // /85, not /70: at 14px on this background /70 measures 4.19:1 and
            // misses AA by a hair.
            <p className="font-family-inter text-sm text-[#2C3333]/85">
              {active.blurb}
            </p>
          )}
        </div>
      )}

      <m.div
        key={active?.id}
        role="tabpanel"
        id={`videos-panel-${active?.id}`}
        aria-labelledby={`videos-tab-${active?.id}`}
        // Columns track the active tab's count: a fixed 3 cols reads as a
        // broken load when a tab only holds 1-2 videos.
        className={`grid w-full grid-cols-1 justify-items-center gap-6 md:gap-8 ${
          (active?.videos.length ?? 0) < 2
            ? 'max-w-[360px]'
            : (active?.videos.length ?? 0) < 3
              ? 'max-w-3xl sm:grid-cols-2'
              : 'max-w-6xl sm:grid-cols-2 lg:grid-cols-3'
        }`}
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
        // `animate` not `whileInView`: the tab-switch remount (`key`) can land
        // already scrolled past, which would never re-enter view.
        animate="visible"
      >
        {active?.videos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </m.div>

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
