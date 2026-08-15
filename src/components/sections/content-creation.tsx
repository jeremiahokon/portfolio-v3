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

// Carries the label's meaning once the word itself collapses on a phone. Chosen to
// be distinguishable at 16px as silhouettes, since on a small screen two of the
// three are shown without any text beside them.
const CATEGORY_ICONS: Record<VideoCategory, LucideIcon> = {
  products: MonitorPlay,
  tools: Wrench,
  opinions: MessageSquareQuote,
};

const VIEW_COUNT_DISPLAY_THRESHOLD = 1000;

// Thumbnail fallback chain: API-provided url → oar2 → maxresdefault → hqdefault.
// The <Image onError> handler walks this chain on 404.
//
// The API url has to come *first*, and used to come second. `oar2.jpg` is a frame
// YouTube auto-generates from the video to fill the 9:16 Shorts player — it is not
// the thumbnail, and because it almost always resolves, nothing further down the
// chain was ever reached. That is why the grid showed random mid-video stills
// instead of the custom thumbnails: the correct image was being fetched from the
// API and then skipped over. `snippet.thumbnails.maxres/standard/high`, which
// lib/youtube.ts already reads into `thumbnailUrl`, is the uploaded custom art.
// The generated URLs stay on as a genuine fallback for videos that have none.
function thumbnailCandidates(video: ShortVideoData): string[] {
  const generated = [
    `https://i.ytimg.com/vi/${video.id}/oar2.jpg`,
    `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
  ];
  if (!video.thumbnailUrl) return generated;

  // De-duplicate by *removing the copy further down the list*, not by discarding
  // the API url. The API almost always hands back the maxresdefault URL, which is
  // already in `generated` — so an `includes()` check that bails out and returns
  // `generated` unchanged silently restores the exact oar2-first order this
  // function exists to prevent. That is what happened here.
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
              // Decorative: the title is already rendered as text at the bottom of
              // this same button, and the button's aria-label announces it too.
              // Repeating it in alt made a screen reader say the title three times
              // for one card (axe: image-redundant-alt).
              alt=""
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
  const groups = groupByCategory(list);
  const [activeId, setActiveId] = useState(groups[0]?.id);
  const active = groups.find((g) => g.id === activeId) ?? groups[0];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys move between tabs and activate as they go, per the WAI-ARIA tabs
  // pattern — without this the tablist is reachable but only operable by Tab, which
  // is the one thing a screen-reader user will not expect from role="tab".
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
      {/* Eyebrow + Heading */}
      <div className="flex flex-col items-center gap-4 text-center">
        {/* This whole block used to be framed as a hobby: "[ ON THE SIDE ]", "I
            create content off the clock, too", "when I'm not shipping code".
            For most readers the content is how they found the site in the first
            place — telling them it is what I do when I am not working reframes my
            own top of funnel as a distraction. It is documentation of the build,
            so it now says that. */}
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
        {/* No standing subhead here. It read "Dashboards, permission systems,
            real-time features — taken apart on camera, while I build them", which
            is three lines on a phone saying roughly what the heading above it
            already said, pushing the tabs and the actual videos further down. The
            per-tab blurb under the tablist covers the same ground and has the
            advantage of being true of the videos you are currently looking at. */}
      </div>

      {/* Category tabs. Products is first and therefore the default: a client who
          reads no further than this section still sees work.

          A segmented control that never wraps. Three uppercase word-labels plus
          counts do not fit across a 390px phone, and the flex-wrap version dropped
          "Opinions" onto its own line under the other two — which reads as a layout
          bug, and worse, as though Opinions were a different kind of thing.

          So the label collapses instead of wrapping: every tab always shows its icon
          and count, and the *selected* tab alone spells its name out. One line at any
          width, the current category still named rather than left as a bare
          pictogram, and the labels return in full from `sm` up. The dark pill is a
          single shared element that slides between tabs via layoutId, so switching
          reads as one control changing state rather than three buttons repainting. */}
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
                  // The visible label is hidden on small screens for unselected
                  // tabs, so the accessible name cannot come from the text alone.
                  // It still *contains* the visible words, which is what lets a
                  // voice-control user say "Products" and hit this button.
                  aria-label={`${group.label} — ${group.videos.length} ${
                    group.videos.length === 1 ? 'video' : 'videos'
                  }`}
                  // Roving tabindex: only the selected tab is a tab stop, so Tab
                  // moves past the whole tablist into the videos rather than
                  // through every category on the way.
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

      {/* Grid */}
      <m.div
        key={active?.id}
        role="tabpanel"
        id={`videos-panel-${active?.id}`}
        aria-labelledby={`videos-tab-${active?.id}`}
        // Columns track the number of videos in the *active* tab. A fixed three
        // columns leaves two cards sitting off to the left looking like a third
        // failed to load — and with the videos split by category, a tab holding
        // one or two is now the normal case rather than the edge case.
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
        // `animate` rather than `whileInView`: switching tabs remounts this grid
        // (the `key`), and a remounted element already scrolled past would never
        // re-enter the viewport, so the new tab's cards would stay at opacity 0.
        animate="visible"
      >
        {active?.videos.map((video) => (
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
