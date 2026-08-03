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

// Stats only need to be roughly fresh — 6h keeps the page effectively
// static and the quota cost negligible (2 units per revalidation).
const REVALIDATE_SECONDS = 21600;
const MAX_SHORTS = 6;
// Anything longer is treated as a regular video (e.g. the 16:9 intro), not a Short.
const MAX_SHORT_DURATION_SECONDS = 210;
const PLAYLIST_FETCH_COUNT = 15;

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
          video.durationSeconds <= MAX_SHORT_DURATION_SECONDS
      )
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      .slice(0, MAX_SHORTS)
      .map((video) => ({
        id: video.id,
        title: video.title,
        viewCount: video.viewCount,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt,
        description: video.description,
      }));

    return shorts.length > 0 ? shorts : null;
  } catch {
    return null;
  }
}
