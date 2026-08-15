import { YOUTUBE_CHANNEL_ID } from './constant';

export interface ShortVideoData {
  id: string;
  title: string;
  viewCount: number | null;
  thumbnailUrl: string | null;
  publishedAt?: string;
  description?: string;
}

interface YouTubeThumbnail {
  url: string;
  width: number;
  height: number;
}

interface YouTubeVideoItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: Record<string, YouTubeThumbnail | undefined>;
  };
  statistics?: {
    viewCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
}

// The grid is sorted into categories, not filtered down to one.
//
// The problem it solves: rendering the six newest Shorts meant a prospective client
// scrolled past six testimonials — one calling me a senior frontend developer — and
// landed on "Coding is Not a Skill Anymore!" and "Don't Underestimate your
// Competition!". Those are aimed at developers who are learning, which is a real
// audience and a fine thing to make videos for; it is just not the audience deciding
// whether to pay me, and senior proof sitting directly above junior content reads as
// the junior version being the true one.
//
// Filtering them off the page fixed that and threw away most of the channel. Sorting
// them fixes it without hiding anything: a client lands on Products and never has to
// see the pep talks, someone who came from a motivational Short can still find its
// siblings, and every video keeps its VideoObject markup in the page. The tab order
// below is the priority order — Products first, because that tab is the default.
export type VideoCategory = 'products' | 'tools' | 'opinions';

export const VIDEO_CATEGORIES: {
  id: VideoCategory;
  label: string;
  blurb: string;
}[] = [
  {
    id: 'products',
    label: 'Products',
    blurb: 'Real platforms I built, walked through end to end.',
  },
  {
    id: 'tools',
    label: 'Free tools',
    blurb: 'The tools on this site, and how they work.',
  },
  {
    id: 'opinions',
    label: 'Opinions',
    blurb: 'What I think about building, shipping and starting.',
  },
];

// Explicit id → category. Titles are too unreliable to classify on ("Dokita Product
// Demo" and "Coding is Not a Skill Anymore!" share no pattern worth regexing), and a
// wrong guess here puts a pep talk on the Products tab, which is the exact failure
// this whole section is meant to prevent. Anything unlisted falls to DEFAULT_CATEGORY.
const VIDEO_CATEGORY_BY_ID: Record<string, VideoCategory> = {
  l7N5K_BUiMc: 'products', // Product Demo (Patient Journey) — Dokita
  '-0kmwpvGJVc': 'products', // Dokita Product Demo
  cPlMLAKCJeg: 'tools', // Extract audio — free, client-side
  // Titled with a bare URL, but it is a personal/brand talk, not a walkthrough of
  // anything. Filed under products at first on the strength of the title alone,
  // which is exactly the mistake the id map exists to prevent.
  CuOJ4VC9RkY: 'opinions',
  Hn4ZPBhCKpk: 'opinions', // Before you Judge, Try it!
  AOH6HErQQK4: 'opinions', // Don't Underestimate your Competition!
  'he-uobSPSzY': 'opinions', // Coding is Not a Skill Anymore!
  '2xFkMccBZo0': 'opinions', // Keep Going at It!
  UTmr9NrpPUk: 'opinions', // Overcome Shyness and Speak with Confidence
  QWuZ9gC0B94: 'opinions', // Anthropic Claude Corps Program
};

// A new upload lands here until it is classified above. 'opinions' rather than
// 'products' on purpose: an unclassified video showing up under Opinions is untidy,
// whereas one showing up under Products is a false claim about my work.
const DEFAULT_CATEGORY: VideoCategory = 'opinions';

// Already rendered on its own, above this section, by youtube-video.tsx. Without
// this it appears twice on the page.
const FEATURE_VIDEO_ID = 'tN3F0NwmBc8';

export function categoryOf(videoId: string): VideoCategory {
  return VIDEO_CATEGORY_BY_ID[videoId] ?? DEFAULT_CATEGORY;
}

// Stats only need to be roughly fresh — 6h keeps the page effectively
// static and the quota cost negligible (2 units per revalidation).
const REVALIDATE_SECONDS = 21600;
// Per category, not per page — six cards is what the grid shows well, and each tab
// is its own grid.
const MAX_SHORTS_PER_CATEGORY = 6;
// Anything longer is treated as a regular video (e.g. the 16:9 intro), not a Short.
const MAX_SHORT_DURATION_SECONDS = 210;
// 50 is the API maximum for both playlistItems and the videos lookup. It was 15,
// which was fine when the grid was "the newest six" but starves the quieter tabs now
// that the videos are split three ways.
const PLAYLIST_FETCH_COUNT = 50;

/**
 * Splits videos into the tab order above, newest first within each tab, capped per
 * tab. Empty categories are dropped so the UI never renders a tab onto a blank grid.
 */
export function groupByCategory<T extends { id: string }>(videos: T[]) {
  return VIDEO_CATEGORIES.map((category) => ({
    ...category,
    videos: videos
      .filter((video) => categoryOf(video.id) === category.id)
      .slice(0, MAX_SHORTS_PER_CATEGORY),
  })).filter((category) => category.videos.length > 0);
}

// A channel's uploads playlist id is its channel id with the 'UC' prefix
// swapped for 'UU'.
const UPLOADS_PLAYLIST_ID = 'UU' + YOUTUBE_CHANNEL_ID.slice(2);

// NOTE: fetch/filter/sort logic is mirrored in scripts/sync-shorts.mjs — keep in sync.
function parseIsoDurationSeconds(iso: string | undefined): number | null {
  if (!iso) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const [, h, m, s] = match;

  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

/**
 * Fetches the channel's latest Shorts (newest first, long videos filtered
 * out) with title, view count, and best thumbnail. Returns null when the API
 * key is missing or any request fails — callers fall back to the committed
 * snapshot in shorts-fallback.json, and the build must never break because
 * of this fetch.
 */
export async function getShortsData(): Promise<ShortVideoData[] | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  try {
    const playlistUrl =
      'https://www.googleapis.com/youtube/v3/playlistItems' +
      `?part=contentDetails&playlistId=${UPLOADS_PLAYLIST_ID}` +
      `&maxResults=${PLAYLIST_FETCH_COUNT}&key=${key}`;
    const playlistRes = await fetch(playlistUrl, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!playlistRes.ok) return null;

    const playlistJson: {
      items?: { contentDetails?: { videoId?: string } }[];
    } = await playlistRes.json();
    const ids = (playlistJson.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return null;

    const videosUrl =
      'https://www.googleapis.com/youtube/v3/videos' +
      `?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${key}`;
    const videosRes = await fetch(videosUrl, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!videosRes.ok) return null;

    const videosJson: { items?: YouTubeVideoItem[] } = await videosRes.json();
    const shorts = (videosJson.items ?? [])
      .map((item) => {
        const thumbnails = item.snippet?.thumbnails ?? {};
        const best =
          thumbnails.maxres ?? thumbnails.standard ?? thumbnails.high;

        return {
          id: item.id,
          title: item.snippet?.title ?? '',
          viewCount: item.statistics?.viewCount
            ? Number(item.statistics.viewCount)
            : null,
          thumbnailUrl: best?.url ?? null,
          publishedAt: item.snippet?.publishedAt,
          description: item.snippet?.description?.trim() || undefined,
          durationSeconds: parseIsoDurationSeconds(
            item.contentDetails?.duration
          ),
        };
      })
      .filter(
        (video) =>
          video.durationSeconds !== null &&
          video.durationSeconds <= MAX_SHORT_DURATION_SECONDS &&
          video.id !== FEATURE_VIDEO_ID
      )
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      .map((video) => ({
        id: video.id,
        title: video.title,
        viewCount: video.viewCount,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt,
        description: video.description,
      }));

    // Returned whole and newest-first; the split into tabs happens at render, so
    // page.tsx can still emit VideoObject markup for every video on the page.
    return shorts.length > 0 ? shorts : null;
  } catch {
    return null;
  }
}
