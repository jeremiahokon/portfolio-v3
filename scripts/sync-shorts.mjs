// Refreshes src/lib/shorts-fallback.json — the snapshot the site falls back
// to when the YouTube Data API is unavailable at runtime.
//
// Usage: pnpm sync-shorts   (also runs automatically as part of `pnpm build`)
//
// ALWAYS exits 0: a missing key or failed fetch keeps the existing snapshot
// so builds never break because of this script.
//
// NOTE: fetch/filter/sort logic is mirrored in src/lib/youtube.ts — keep in sync.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANNEL_ID = 'UCcmp0d3tTWEbIJkMNVvG9pw';
const UPLOADS_PLAYLIST_ID = 'UU' + CHANNEL_ID.slice(2);
const MAX_SHORTS = 6;
const MAX_SHORT_DURATION_SECONDS = 210;
const PLAYLIST_FETCH_COUNT = 15;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(repoRoot, 'src', 'lib', 'shorts-fallback.json');

function log(message) {
  console.warn(`[sync-shorts] ${message}`);
}

function resolveApiKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  try {
    const envFile = fs.readFileSync(path.join(repoRoot, '.env.local'), 'utf8');
    const match = envFile.match(/^YOUTUBE_API_KEY=(.*)$/m);
    if (match) return match[1].trim().replace(/^['"]|['"]$/g, '');
  } catch {
    // no .env.local — fall through
  }
  return null;
}

function parseIsoDurationSeconds(iso) {
  if (!iso) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

async function fetchLatestShorts(key) {
  const playlistUrl =
    'https://www.googleapis.com/youtube/v3/playlistItems' +
    `?part=contentDetails&playlistId=${UPLOADS_PLAYLIST_ID}` +
    `&maxResults=${PLAYLIST_FETCH_COUNT}&key=${key}`;
  const playlistRes = await fetch(playlistUrl);
  if (!playlistRes.ok) throw new Error(`playlistItems HTTP ${playlistRes.status}`);
  const playlistJson = await playlistRes.json();
  const ids = (playlistJson.items ?? [])
    .map((item) => item.contentDetails?.videoId)
    .filter(Boolean);
  if (ids.length === 0) throw new Error('uploads playlist returned no videos');

  const videosUrl =
    'https://www.googleapis.com/youtube/v3/videos' +
    `?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${key}`;
  const videosRes = await fetch(videosUrl);
  if (!videosRes.ok) throw new Error(`videos HTTP ${videosRes.status}`);
  const videosJson = await videosRes.json();

  return (videosJson.items ?? [])
    .map((item) => {
      const thumbnails = item.snippet?.thumbnails ?? {};
      const best = thumbnails.maxres ?? thumbnails.standard ?? thumbnails.high;
      return {
        id: item.id,
        title: item.snippet?.title ?? '',
        viewCount: item.statistics?.viewCount
          ? Number(item.statistics.viewCount)
          : null,
        thumbnailUrl: best?.url ?? null,
        publishedAt: item.snippet?.publishedAt,
        description: item.snippet?.description?.trim() || undefined,
        durationSeconds: parseIsoDurationSeconds(item.contentDetails?.duration),
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
}

async function main() {
  const key = resolveApiKey();
  if (!key) {
    log('YOUTUBE_API_KEY not set — keeping existing snapshot.');
    return;
  }

  let videos;
  try {
    videos = await fetchLatestShorts(key);
  } catch (error) {
    log(`fetch failed (${error.message}) — keeping existing snapshot.`);
    return;
  }

  if (videos.length === 0) {
    log('no Shorts matched the filter — keeping existing snapshot.');
    return;
  }

  try {
    const existing = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    if (JSON.stringify(existing.videos) === JSON.stringify(videos)) {
      log('snapshot already up to date.');
      return;
    }
  } catch {
    // missing or unreadable snapshot — write a fresh one
  }

  const snapshot = { generatedAt: new Date().toISOString(), videos };
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');
  log(`snapshot updated with ${videos.length} Shorts.`);
}

main().catch((error) => {
  log(`unexpected error (${error.message}) — keeping existing snapshot.`);
});
